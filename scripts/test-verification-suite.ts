#!/usr/bin/env tsx

/**
 * Test Runner for Post-Deployment Verification Suite
 * Validates that the verification script works correctly
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

interface TestCase {
  name: string;
  args: string[];
  expectedExitCode: number;
  expectedOutput?: string[];
  unexpectedOutput?: string[];
  setupEnv?: Record<string, string>;
  timeout?: number;
}

class VerificationSuiteTester {
  private testResults: Array<{ name: string; passed: boolean; error?: string }> = [];

  async runTests(): Promise<void> {
    console.log('🧪 Testing Post-Deployment Verification Suite');
    console.log('==============================================');
    console.log('');

    const testCases: TestCase[] = [
      {
        name: 'Help Command',
        args: ['--help'],
        expectedExitCode: 0,
        expectedOutput: ['FlowReader Post-Deployment Verification', 'USAGE:', 'EXAMPLES:']
      },
      {
        name: 'Invalid URL Format',
        args: ['invalid-url'],
        expectedExitCode: 1,
        expectedOutput: ['URL must start with http:// or https://']
      },
      {
        name: 'Timeout Configuration',
        args: ['http://httpstat.us/200?sleep=1000'],
        expectedExitCode: 0, // Should pass with default timeout
        setupEnv: { VERIFY_TIMEOUT: '5000' },
        timeout: 10000
      },
      {
        name: 'Mock Health Check Success',
        args: ['http://httpstat.us/200'],
        expectedExitCode: 0,
        setupEnv: {
          VERIFY_TIMEOUT: '10000',
          HEALTH_CHECK_MAX_MS: '5000',
          API_MAX_MS: '8000'
        },
        timeout: 15000
      },
      {
        name: 'Mock Health Check Failure',
        args: ['http://httpstat.us/500'],
        expectedExitCode: 1,
        setupEnv: { VERIFY_TIMEOUT: '5000' },
        timeout: 10000
      },
      {
        name: 'Connection Timeout',
        args: ['http://httpstat.us/200?sleep=15000'],
        expectedExitCode: 1,
        setupEnv: { VERIFY_TIMEOUT: '2000' },
        timeout: 5000
      }
    ];

    for (const testCase of testCases) {
      await this.runTestCase(testCase);
    }

    this.printSummary();
  }

  private async runTestCase(testCase: TestCase): Promise<void> {
    console.log(`🧪 Running: ${testCase.name}`);

    try {
      const result = await this.executeVerificationScript(testCase);

      // Check exit code
      if (result.exitCode !== testCase.expectedExitCode) {
        throw new Error(`Expected exit code ${testCase.expectedExitCode}, got ${result.exitCode}`);
      }

      // Check expected output
      if (testCase.expectedOutput) {
        for (const expected of testCase.expectedOutput) {
          if (!result.output.includes(expected)) {
            throw new Error(`Expected output to contain: "${expected}"`);
          }
        }
      }

      // Check unexpected output
      if (testCase.unexpectedOutput) {
        for (const unexpected of testCase.unexpectedOutput) {
          if (result.output.includes(unexpected)) {
            throw new Error(`Output should not contain: "${unexpected}"`);
          }
        }
      }

      this.testResults.push({ name: testCase.name, passed: true });
      console.log(`    ✅ PASS`);

    } catch (error) {
      this.testResults.push({
        name: testCase.name,
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`    ❌ FAIL: ${error instanceof Error ? error.message : error}`);
    }

    console.log('');
  }

  private executeVerificationScript(testCase: TestCase): Promise<{
    exitCode: number;
    output: string;
  }> {
    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        ...testCase.setupEnv
      };

      const child = spawn('npm', ['run', 'verify:post-deploy', ...testCase.args], {
        env,
        stdio: 'pipe',
        cwd: process.cwd()
      });

      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => {
        output += data.toString();
      });

      child.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Test timeout after ${testCase.timeout || 30000}ms`));
      }, testCase.timeout || 30000);

      child.on('close', (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code || 0,
          output: output + errorOutput
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private printSummary(): void {
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;

    console.log('📊 Test Summary');
    console.log('===============');
    console.log(`Total: ${this.testResults.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('');

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.testResults
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`  • ${result.name}: ${result.error}`);
        });
      console.log('');
    }

    if (failed === 0) {
      console.log('🎉 All verification suite tests passed!');
      process.exit(0);
    } else {
      console.log('💥 Some verification suite tests failed');
      process.exit(1);
    }
  }
}

// Self-test functionality
async function selfTest(): Promise<void> {
  console.log('🔍 Running self-test of verification suite...');

  // Test 1: Verify script exists
  try {
    const scriptPath = join(process.cwd(), 'scripts', 'post-deploy-verify.ts');
    readFileSync(scriptPath);
    console.log('✅ Verification script exists');
  } catch (error) {
    console.error('❌ Verification script not found');
    process.exit(1);
  }

  // Test 2: Verify package.json has scripts
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    if (!packageJson.scripts['verify:post-deploy']) {
      throw new Error('Missing verify:post-deploy script');
    }
    console.log('✅ Package.json scripts configured');
  } catch (error) {
    console.error('❌ Package.json configuration error:', error);
    process.exit(1);
  }

  // Test 3: Check dependencies
  try {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    if (!packageJson.devDependencies?.tsx) {
      console.warn('⚠️  tsx dependency not found in devDependencies');
    } else {
      console.log('✅ Dependencies check passed');
    }
  } catch (error) {
    console.error('❌ Dependencies check failed:', error);
    process.exit(1);
  }

  console.log('✅ Self-test completed successfully');
  console.log('');
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--self-test')) {
    await selfTest();
    return;
  }

  if (args.includes('--help')) {
    console.log(`
Test Runner for Post-Deployment Verification Suite

USAGE:
    npm run test:verify-suite
    tsx scripts/test-verification-suite.ts [OPTIONS]

OPTIONS:
    --help        Show this help
    --self-test   Run basic self-test only

DESCRIPTION:
    This script tests the post-deployment verification suite itself
    to ensure it works correctly across different scenarios.

TESTS:
    • Help command functionality
    • URL validation
    • Timeout handling
    • Mock HTTP responses
    • Error conditions

NOTE:
    This test runner uses public HTTP testing services like httpstat.us
    to simulate different response conditions. An internet connection
    is required for most tests.
`);
    return;
  }

  await selfTest();

  const tester = new VerificationSuiteTester();
  await tester.runTests();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Test runner crashed:', error);
    process.exit(2);
  });
}

export { VerificationSuiteTester };