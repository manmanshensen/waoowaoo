/**
 * Async task status helpers for third-party AI providers.
 */

import { createGoogleGenAIClient } from './google-auth'
import { logInternal } from './logging/semantic'

export interface TaskStatus {
    status: 'pending' | 'completed' | 'failed'
    imageUrl?: string
    videoUrl?: string
    error?: string
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
    return value && typeof value === 'object' ? (value as UnknownRecord) : null
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    const record = asRecord(error)
    if (record && typeof record.message === 'string') return record.message
    return String(error)
}

function getErrorStatus(error: unknown): number | undefined {
    const record = asRecord(error)
    if (!record) return undefined
    return typeof record.status === 'number' ? record.status : undefined
}

interface GeminiBatchClient {
    batches: {
        get(args: { name: string }): Promise<unknown>
    }
}

export async function queryBananaTaskStatus(requestId: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('Please configure FAL API Key')
    }

    try {
        const statusResponse = await fetch(
            `https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}/status`,
            {
                headers: { 'Authorization': `Key ${apiKey}` },
                cache: 'no-store',
            },
        )

        if (!statusResponse.ok) {
            logInternal('Banana', 'ERROR', `Status query failed: ${statusResponse.status}`)
            return { status: 'pending' }
        }

        const data = await statusResponse.json()

        if (data.status === 'COMPLETED') {
            const resultResponse = await fetch(
                `https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}`,
                {
                    headers: { 'Authorization': `Key ${apiKey}` },
                    cache: 'no-store',
                },
            )

            if (resultResponse.ok) {
                const result = await resultResponse.json()
                const imageUrl = result.images?.[0]?.url

                if (imageUrl) {
                    return { status: 'completed', imageUrl }
                }
            }

            return { status: 'failed', error: 'No image URL in result' }
        }

        if (data.status === 'FAILED') {
            return { status: 'failed', error: data.error || 'Banana generation failed' }
        }

        return { status: 'pending' }
    } catch (error: unknown) {
        logInternal('Banana', 'ERROR', 'Query error', { error: getErrorMessage(error) })
        return { status: 'pending' }
    }
}

export async function queryGeminiBatchStatus(batchName: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('Please configure Google AI API Key')
    }

    try {
        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey })

        const batchClient = ai as unknown as GeminiBatchClient
        const batchJob = await batchClient.batches.get({ name: batchName })
        const batchRecord = asRecord(batchJob) || {}

        const state = typeof batchRecord.state === 'string' ? batchRecord.state : 'UNKNOWN'
        logInternal('GeminiBatch', 'INFO', `Batch status: ${batchName} -> ${state}`)

        if (state === 'JOB_STATE_SUCCEEDED') {
            const dest = asRecord(batchRecord.dest)
            const responses = Array.isArray(dest?.inlinedResponses) ? dest.inlinedResponses : []

            if (responses.length > 0) {
                const firstResponse = asRecord(responses[0])
                const response = asRecord(firstResponse?.response)
                const candidates = Array.isArray(response?.candidates) ? response.candidates : []
                const firstCandidate = asRecord(candidates[0])
                const content = asRecord(firstCandidate?.content)
                const parts = Array.isArray(content?.parts) ? content.parts : []

                for (const part of parts) {
                    const partRecord = asRecord(part)
                    const inlineData = asRecord(partRecord?.inlineData)
                    if (typeof inlineData?.data === 'string') {
                        const imageBase64 = inlineData.data
                        const mimeType = typeof inlineData.mimeType === 'string' ? inlineData.mimeType : 'image/png'
                        const imageUrl = `data:${mimeType};base64,${imageBase64}`

                        logInternal('GeminiBatch', 'INFO', `Image extracted from batch result`, { batchName, mimeType })
                        return { status: 'completed', imageUrl }
                    }
                }
            }

            return { status: 'failed', error: 'No image data in batch result' }
        }

        if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED' || state === 'JOB_STATE_EXPIRED') {
            return { status: 'failed', error: `Gemini Batch failed: ${state}` }
        }

        return { status: 'pending' }
    } catch (error: unknown) {
        const message = getErrorMessage(error)
        const status = getErrorStatus(error)
        logInternal('GeminiBatch', 'ERROR', 'Query error', { batchName, error: message, status })
        if (status === 404 || message.includes('404') || message.includes('not found') || message.includes('NOT_FOUND')) {
            return { status: 'failed', error: 'Batch task not found' }
        }
        return { status: 'pending' }
    }
}

export async function queryGoogleVideoStatus(operationName: string, apiKey: string): Promise<TaskStatus> {
    const vertexProject = process.env.GOOGLE_VERTEX_PROJECT?.trim()
    if (!vertexProject && !apiKey) {
        throw new Error('Please configure Google AI API Key')
    }

    const logPrefix = '[Veo Query]'

    try {
        const { GenerateVideosOperation } = await import('@google/genai')
        const ai = createGoogleGenAIClient(apiKey)
        const operation = new GenerateVideosOperation()
        operation.name = operationName
        const op = await ai.operations.getVideosOperation({ operation })

        logInternal('Veo', 'INFO', `${logPrefix} raw response`, {
            operationName,
            done: op.done,
            hasError: !!op.error,
            hasResponse: !!op.response,
            responseKeys: op.response ? Object.keys(op.response) : [],
            generatedVideosCount: op.response?.generatedVideos?.length ?? 0,
            raiFilteredCount: (op.response as Record<string, unknown>)?.raiMediaFilteredCount ?? null,
            raiFilteredReasons: (op.response as Record<string, unknown>)?.raiMediaFilteredReasons ?? null,
        })

        if (!op.done) {
            return { status: 'pending' }
        }

        if (op.error) {
            const errRecord = asRecord(op.error)
            const message = (typeof errRecord?.message === 'string' && errRecord.message)
                || (typeof errRecord?.statusMessage === 'string' && errRecord.statusMessage)
                || 'Veo task failed'
            logInternal('Veo', 'ERROR', `${logPrefix} operation error`, { operationName, error: op.error })
            return { status: 'failed', error: message }
        }

        const response = op.response
        if (!response) {
            logInternal('Veo', 'ERROR', `${logPrefix} done=true but response is empty`, { operationName })
            return { status: 'failed', error: 'Veo task completed but response body is empty' }
        }

        const responseRecord = asRecord(response) || {}
        const raiFilteredCount = responseRecord.raiMediaFilteredCount
        const raiFilteredReasons = responseRecord.raiMediaFilteredReasons

        if (typeof raiFilteredCount === 'number' && raiFilteredCount > 0) {
            const reasons = Array.isArray(raiFilteredReasons) ? raiFilteredReasons.join(', ') : 'unknown'
            logInternal('Veo', 'ERROR', `${logPrefix} filtered by RAI`, {
                operationName,
                raiFilteredCount,
                raiFilteredReasons: reasons,
            })
            return {
                status: 'failed',
                error: `Veo video was filtered by safety policy (${raiFilteredCount}, reason: ${reasons})`,
            }
        }

        const generatedVideos = response.generatedVideos
        if (Array.isArray(generatedVideos) && generatedVideos.length > 0) {
            const first = generatedVideos[0]
            const firstRecord = asRecord(first) || {}
            const videoRecord = asRecord(firstRecord.video)
            const videoAttributes = asRecord(videoRecord?.videoAttributes)
            const videoBytes = (typeof videoAttributes?.videoBytes === 'string' && videoAttributes.videoBytes)
                || (typeof videoRecord?.videoBytes === 'string' && videoRecord.videoBytes)
            const mimeType = (typeof videoAttributes?.mimeType === 'string' && videoAttributes.mimeType)
                || (typeof firstRecord.mimeType === 'string' && firstRecord.mimeType)
                || 'video/mp4'
            const videoUri = (typeof videoRecord?.uri === 'string' && videoRecord.uri)
                || (typeof firstRecord.uri === 'string' && firstRecord.uri)

            if (videoUri) {
                logInternal('Veo', 'INFO', `${logPrefix} resolved video URI`, {
                    operationName,
                    videoUri: videoUri.substring(0, 80),
                })
                return { status: 'completed', videoUrl: videoUri }
            }

            if (videoBytes) {
                const dataUrl = `data:${mimeType};base64,${videoBytes}`
                logInternal('Veo', 'INFO', `${logPrefix} resolved inline video bytes`, {
                    operationName,
                    mimeType,
                    size: videoBytes.length,
                })
                return { status: 'completed', videoUrl: dataUrl }
            }

            logInternal('Veo', 'ERROR', `${logPrefix} could not parse generatedVideos[0]`, {
                operationName,
                firstVideoContent: JSON.stringify(first),
                availableKeys: Object.keys(firstRecord),
                videoKeys: videoRecord ? Object.keys(videoRecord) : [],
                attrKeys: videoAttributes ? Object.keys(videoAttributes) : [],
            })
            return {
                status: 'failed',
                error: `Veo video payload missing uri and video bytes: ${JSON.stringify(first).substring(0, 200)}`,
            }
        }

        logInternal('Veo', 'ERROR', `${logPrefix} missing generatedVideos`, {
            operationName,
            responseKeys: Object.keys(responseRecord),
            fullResponse: JSON.stringify(responseRecord, null, 2).substring(0, 2000),
            raiFilteredCount: raiFilteredCount ?? 'N/A',
            raiFilteredReasons: raiFilteredReasons ?? 'N/A',
        })
        return { status: 'failed', error: 'Veo task completed but returned no generated videos' }
    } catch (error: unknown) {
        const message = getErrorMessage(error)
        logInternal('Veo', 'ERROR', `${logPrefix} query exception`, { operationName, error: message })
        return { status: 'failed', error: message }
    }
}

export async function querySeedanceVideoStatus(taskId: string, apiKey: string): Promise<TaskStatus> {
    if (!apiKey) {
        throw new Error('Please configure Volcengine API Key')
    }

    try {
        const queryResponse = await fetch(
            `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                cache: 'no-store',
            },
        )

        if (!queryResponse.ok) {
            logInternal('Seedance', 'ERROR', `Status query failed: ${queryResponse.status}`)
            return { status: 'pending' }
        }

        const queryData = await queryResponse.json()
        const status = queryData.status

        if (status === 'succeeded') {
            const videoUrl = queryData.content?.video_url

            if (videoUrl) {
                return { status: 'completed', videoUrl }
            }

            return { status: 'failed', error: 'No video URL in response' }
        }

        if (status === 'failed') {
            const errorObj = queryData.error || {}
            const errorMessage = errorObj.message || 'Unknown error'
            return { status: 'failed', error: errorMessage }
        }

        return { status: 'pending' }
    } catch (error: unknown) {
        logInternal('Seedance', 'ERROR', 'Query error', { error: getErrorMessage(error) })
        return { status: 'pending' }
    }
}
