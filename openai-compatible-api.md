# OpenAI 兼容 API 对接文档

本文档说明如何把 `gemini-skill` 作为一个 OpenAI 兼容的 HTTP API 服务，供其他项目直接调用。

适用场景：

- 其他 Node/Python/前端项目希望通过 HTTP 调用 Gemini 对话
- 其他服务希望复用 Gemini 生图能力
- 希望尽量少改业务代码，按 OpenAI 风格接入

## 1. 能力概览

当前服务提供以下接口：

- `GET /health`：健康检查
- `GET /v1/models`：获取可用模型
- `POST /v1/chat/completions`：文本对话
- `POST /v1/images/generations`：图片生成
- `GET /v1/files/:filename`：访问已生成图片文件

当前兼容模型 ID：

- `gemini-web-proxy`：文本对话
- `gemini-image-web-proxy`：图片生成

已知限制：

- 暂不支持流式输出，`stream=true` 会返回错误
- 图片生成仅支持 `n=1`
- 图片接口仅支持 `response_format=url` 或 `response_format=b64_json`
- 请求是串行排队执行的，同一时刻只处理一个 Gemini 任务

## 2. 前置条件

在正式对接前，请先确保运行环境满足以下条件：

- Node.js >= 18
- 机器上已安装 Chrome / Edge / Chromium
- 浏览器里已经登录 Google 账号，并且可正常使用 Gemini
- 当前机器网络可正常访问 `https://gemini.google.com`

注意：

- 这个服务底层不是官方 Gemini API，而是浏览器自动化
- 第一次使用时建议 `BROWSER_HEADLESS=false`，便于确认登录状态
- 如果 Gemini 网页结构变动，接口可能需要同步更新选择器

## 3. 启动服务

项目根目录执行：

```bash
npm run openai
```

默认监听：

```text
http://0.0.0.0:4000
```

默认基础路径：

```text
http://127.0.0.1:4000/v1
```

## 4. 环境变量

可以通过 `.env` 或进程环境变量配置服务。

### OpenAI 兼容服务相关

```env
OPENAI_COMPAT_HOST=0.0.0.0
OPENAI_COMPAT_PORT=4000
OPENAI_COMPAT_API_KEY=
```

说明：

- `OPENAI_COMPAT_HOST`：HTTP 服务监听地址
- `OPENAI_COMPAT_PORT`：HTTP 服务端口
- `OPENAI_COMPAT_API_KEY`：开启 Bearer Token 鉴权；留空表示不鉴权

### 浏览器与 Daemon 相关

```env
BROWSER_PATH=
BROWSER_DEBUG_PORT=40821
BROWSER_HEADLESS=false
OUTPUT_DIR=./gemini-image
DAEMON_PORT=40225
DAEMON_TTL_MS=1800000
```

说明：

- `BROWSER_PATH`：浏览器可执行文件路径，不填则自动探测
- `BROWSER_DEBUG_PORT`：Chrome CDP 端口
- `BROWSER_HEADLESS`：是否无头模式
- `OUTPUT_DIR`：图片输出目录
- `DAEMON_PORT`：浏览器守护进程端口
- `DAEMON_TTL_MS`：浏览器空闲自动释放时间，默认 30 分钟

## 5. 鉴权方式

当 `OPENAI_COMPAT_API_KEY` 非空时，所有 `/v1/*` 接口都要求带：

```http
Authorization: Bearer <你的密钥>
```

未携带或不匹配时会返回：

```json
{
  "error": {
    "message": "Invalid or missing API key.",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

`/health` 不要求鉴权。

## 6. 接入参数

如果你的 SDK 或项目支持 OpenAI 风格配置，可直接使用：

```text
baseURL = http://127.0.0.1:4000/v1
apiKey = 你的 OPENAI_COMPAT_API_KEY
```

如果当前服务未开启鉴权：

- 某些 SDK 仍然要求 `apiKey` 非空，可以填任意字符串

## 7. 接口说明

## 7.1 健康检查

请求：

```http
GET /health
```

示例：

```bash
curl http://127.0.0.1:4000/health
```

返回示例：

```json
{
  "ok": true,
  "queue": "ready",
  "outputDir": "./gemini-image"
}
```

## 7.2 获取模型

请求：

```http
GET /v1/models
```

示例：

```bash
curl http://127.0.0.1:4000/v1/models
```

返回示例：

```json
{
  "object": "list",
  "data": [
    {
      "id": "gemini-web-proxy",
      "object": "model",
      "created": 0,
      "owned_by": "local"
    },
    {
      "id": "gemini-image-web-proxy",
      "object": "model",
      "created": 0,
      "owned_by": "local"
    }
  ]
}
```

## 7.3 文本对话

请求：

```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

请求体示例：

```json
{
  "model": "gemini-web-proxy",
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "请用一句话介绍这个服务。"
    }
  ],
  "timeout_ms": 120000
}
```

字段说明：

- `model`：可填 `gemini-web-proxy`
- `messages`：非空数组，支持普通字符串内容
- `timeout_ms`：Gemini 回复超时，默认 `120000`
- `stream`：当前不支持，传 `true` 会报错

`messages` 内容兼容两种写法：

```json
{
  "role": "user",
  "content": "你好"
}
```

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "你好" }
  ]
}
```

服务内部会把 `messages` 合并成一段文本发送给 Gemini，格式类似：

```text
SYSTEM: ...

USER: ...
```

返回示例：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1774965916,
  "model": "gemini-web-proxy",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "收到，这条测试消息已确认。"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

### cURL 示例

```bash
curl http://127.0.0.1:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-web-proxy",
    "messages": [
      { "role": "user", "content": "请用一句中文确认你已收到消息。" }
    ],
    "timeout_ms": 120000
  }'
```

## 7.4 图片生成

请求：

```http
POST /v1/images/generations
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

请求体示例：

```json
{
  "model": "gemini-image-web-proxy",
  "prompt": "一只坐在键盘前写代码的橘猫，暖色调，写实风格",
  "response_format": "url",
  "n": 1,
  "timeout_ms": 180000
}
```

字段说明：

- `model`：可填 `gemini-image-web-proxy`
- `prompt`：必填
- `response_format`：支持 `url` 或 `b64_json`
- `n`：仅支持 `1`
- `timeout_ms`：生图超时，默认 `180000`

服务内部会：

- 自动新建 Gemini 对话
- 自动切换到 Gemini Pro
- 等待图片生成
- 下载完整尺寸图片
- 自动去除 Gemini 水印
- 将文件保存到 `OUTPUT_DIR`

当 `response_format=url` 时，返回示例：

```json
{
  "created": 1774966254,
  "model": "gemini-image-web-proxy",
  "data": [
    {
      "url": "http://127.0.0.1:4000/v1/files/Gemini_Generated_Image_x6fly2x6fly2x6fl.png",
      "revised_prompt": "一只坐在键盘前写代码的橘猫，暖色调，写实风格"
    }
  ]
}
```

当 `response_format=b64_json` 时，返回示例：

```json
{
  "created": 1774966254,
  "model": "gemini-image-web-proxy",
  "data": [
    {
      "b64_json": "<base64>",
      "revised_prompt": "一只坐在键盘前写代码的橘猫，暖色调，写实风格"
    }
  ]
}
```

### cURL 示例

```bash
curl http://127.0.0.1:4000/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gemini-image-web-proxy",
    "prompt": "一只坐在键盘前写代码的橘猫，暖色调，写实风格",
    "response_format": "url",
    "timeout_ms": 180000
  }'
```

## 7.5 获取图片文件

请求：

```http
GET /v1/files/:filename
```

示例：

```bash
curl -O http://127.0.0.1:4000/v1/files/Gemini_Generated_Image_x6fly2x6fly2x6fl.png
```

说明：

- 文件从 `OUTPUT_DIR` 目录读取
- 路径中的文件名会被服务端规范化处理
- 如果开启了 API Key，访问该接口同样需要 `Authorization` 头

## 8. SDK 接入示例

## 8.1 Node.js 原生 fetch

```js
const baseURL = 'http://127.0.0.1:4000/v1';
const apiKey = process.env.GEMINI_API_KEY || '';

async function chat() {
  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: 'gemini-web-proxy',
      messages: [
        { role: 'user', content: '请介绍一下这个 API。' },
      ],
      timeout_ms: 120000,
    }),
  });

  const data = await response.json();
  console.log(data.choices[0].message.content);
}

chat();
```

## 8.2 使用 OpenAI SDK

```js
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || 'dummy-key',
  baseURL: 'http://127.0.0.1:4000/v1',
});

const chat = await client.chat.completions.create({
  model: 'gemini-web-proxy',
  messages: [
    { role: 'user', content: '请用一句中文确认收到消息。' },
  ],
});

console.log(chat.choices[0].message.content);
```

说明：

- 某些 OpenAI SDK 会强制要求 `apiKey` 非空，即使服务端没开启鉴权也要传一个占位值
- 当前不支持 `stream`

## 8.3 Python requests

```python
import requests

base_url = "http://127.0.0.1:4000/v1"
api_key = ""

headers = {
    "Content-Type": "application/json",
}

if api_key:
    headers["Authorization"] = f"Bearer {api_key}"

payload = {
    "model": "gemini-web-proxy",
    "messages": [
        {"role": "user", "content": "请介绍一下这个服务。"}
    ],
    "timeout_ms": 120000,
}

resp = requests.post(f"{base_url}/chat/completions", json=payload, headers=headers, timeout=180)
resp.raise_for_status()
data = resp.json()
print(data["choices"][0]["message"]["content"])
```

## 9. 返回错误说明

### 认证错误

```json
{
  "error": {
    "message": "Invalid or missing API key.",
    "type": "authentication_error",
    "code": "invalid_api_key"
  }
}
```

### 请求体不是合法 JSON

```json
{
  "error": {
    "message": "Request body must be valid JSON.",
    "type": "server_error",
    "code": "internal_error"
  }
}
```

### 对话不支持流式

```json
{
  "error": {
    "message": "stream=true is not supported yet.",
    "type": "invalid_request_error",
    "code": "unsupported_stream"
  }
}
```

### 图片请求缺少 prompt

```json
{
  "error": {
    "message": "prompt is required.",
    "type": "invalid_request_error",
    "code": "missing_prompt"
  }
}
```

### 图片请求不支持多图

```json
{
  "error": {
    "message": "Only n=1 is supported.",
    "type": "invalid_request_error",
    "code": "unsupported_n"
  }
}
```

### 路由不存在

```json
{
  "error": {
    "message": "Route not found: POST /xxx",
    "type": "invalid_request_error",
    "code": "not_found"
  }
}
```

## 10. 行为说明

接入前建议理解以下行为：

- 每次请求会新建 Gemini 会话，不会复用上一次 HTTP 请求的对话上下文
- 文本接口会把 `messages` 拼接成一段文本发送给 Gemini，不是官方多轮 API 的精确语义
- 图片接口会强制切换到 `Pro`
- 服务端内部通过队列串行处理请求，避免多个调用同时抢同一个 Gemini 页面
- 浏览器由 Daemon 守护，HTTP 请求结束后不会立即关闭浏览器

## 11. 性能与超时建议

建议调用方使用比服务端更宽松的 HTTP 超时：

- 文本对话：客户端超时建议 `150 ~ 180` 秒
- 图片生成：客户端超时建议 `240 ~ 300` 秒

原因：

- 底层需要浏览器导航、页面稳定、模型切换和 Gemini 实际生成
- 图片接口通常比文本接口慢很多

## 12. 常见问题

### 12.1 `/health` 正常，但对话或生图失败

通常说明 HTTP 服务活着，但浏览器侧状态异常。优先排查：

- 浏览器是否已登录 Google
- Gemini 网页是否可正常打开
- 当前网络是否能访问 Gemini
- 页面结构是否发生变化

### 12.2 为什么没有 token 用量？

这是网页自动化代理，不是官方模型 API，所以：

- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

目前统一返回 `0`。

### 12.3 为什么并发请求会变慢？

因为当前实现使用串行队列，目的是保证稳定性，避免多个任务同时操控同一个 Gemini 页面。

### 12.4 为什么图片接口返回的是本地文件 URL？

图片实际先下载到本机，再由：

```text
GET /v1/files/:filename
```

对外提供访问。

如果服务部署在远程机器上，请把 `OPENAI_COMPAT_HOST`、反向代理和外部访问域名一起规划好。

## 13. 排障建议

建议按这个顺序排查：

1. `GET /health` 是否正常
2. `GET /v1/models` 是否正常
3. 浏览器里是否已登录 Gemini
4. 先测文本接口，再测图片接口
5. 看服务端日志里是否有导航失败、页面元素找不到、下载失败等信息

## 14. 推荐部署方式

开发环境：

- 直接 `npm run openai`

长期运行环境：

- `pm2`
- `systemd`
- Docker 外再挂一个反向代理

反向代理时建议：

- 保留足够长的 upstream timeout
- 若对外暴露，务必开启 API Key
- 根据实际部署地址修正客户端 `baseURL`

## 15. 相关文件

- OpenAI 兼容服务实现：[src/openai-server.js](/Users/shenman/Worlk/ai/gemini-skill/src/openai-server.js)
- 浏览器连接与守护：[src/browser.js](/Users/shenman/Worlk/ai/gemini-skill/src/browser.js)
- Gemini 高层操作封装：[src/gemini-ops.js](/Users/shenman/Worlk/ai/gemini-skill/src/gemini-ops.js)
- 示例调用脚本：[examples/openai-compatible-client.js](/Users/shenman/Worlk/ai/gemini-skill/examples/openai-compatible-client.js)

