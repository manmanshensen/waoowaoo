import { execSync } from 'node:child_process'
import { loadTestEnv } from './env'

const TEST_COMPOSE_PROJECT_NAME = 'waoowaoo_teststack'

function runTestCompose(command: string) {
  execSync(`docker compose -f docker-compose.test.yml ${command}`, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      COMPOSE_PROJECT_NAME: TEST_COMPOSE_PROJECT_NAME,
    },
  })
}

export async function runGlobalTeardown() {
  loadTestEnv()

  const shouldBootstrap = process.env.BILLING_TEST_BOOTSTRAP === '1' || process.env.SYSTEM_TEST_BOOTSTRAP === '1'
  if (!shouldBootstrap) return
  if (process.env.BILLING_TEST_KEEP_SERVICES === '1') return

  runTestCompose('down -v --remove-orphans')
}
