#!/usr/bin/env node

/**
 * 工作区 API 手动测试脚本
 * 测试持久化工作区容器的启动和执行流程
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');

const execFileAsync = promisify(execFile);

const CONTAINER_NAME = 'ai-platform-workspace';
const WORKSPACE_PATH = '/workspace';

async function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function testWorkspaceAPI() {
  try {
    // Test 1: 检查容器是否存在
    await log('测试 1: 检查容器状态...');
    try {
      const result = await execFileAsync('docker', ['inspect', CONTAINER_NAME]);
      const data = JSON.parse(result.stdout);
      if (data[0]?.State?.Running) {
        await log(`✓ 容器 ${CONTAINER_NAME} 正在运行`);
      } else {
        await log(`⚠ 容器存在但未运行，启动中...`);
        await execFileAsync('docker', ['start', CONTAINER_NAME]);
        await log(`✓ 容器已启动`);
      }
    } catch (e) {
      await log(`✗ 容器不存在，创建新容器...`);
      await execFileAsync('docker', [
        'run', '-d',
        '--name', CONTAINER_NAME,
        '--memory', '512m',
        '--cpus', '2',
        '--network', 'none',
        '-v', 'ai-workspace:/workspace',
        'python:3.11-slim',
        'tail', '-f', '/dev/null'
      ]);
      await log(`✓ 容器创建成功`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test 2: 在容器内执行 Python 代码
    await log('\n测试 2: 执行 Python 代码...');
    const codeFile = `${WORKSPACE_PATH}/test_code.py`;
    const pythonCode = `print("Hello from workspace!")
import os
print(f"Working directory: {os.getcwd()}")
print(f"Files in workspace: {os.listdir(os.path.dirname(os.path.dirname('/workspace/')))}")`;

    // 写入代码文件
    await execFileAsync('docker', [
      'exec', CONTAINER_NAME,
      'bash', '-c', `cat > "${codeFile}" << 'EOF'\n${pythonCode}\nEOF`
    ]);
    await log(`✓ 代码文件已写入`);

    // 执行代码
    const execResult = await execFileAsync('docker', [
      'exec', '-w', WORKSPACE_PATH, CONTAINER_NAME,
      'python', 'test_code.py'
    ]);
    await log(`✓ Python 执行输出:`);
    console.log(execResult.stdout);

    // Test 3: 写入和读取文件
    await log('\n测试 3: 文件持久化...');
    const testFile = `${WORKSPACE_PATH}/persistent_test.txt`;
    const testContent = `This file was created at ${new Date().toISOString()}`;

    // 写入
    await execFileAsync('docker', [
      'exec', CONTAINER_NAME,
      'bash', '-c', `cat > "${testFile}" << 'EOF'\n${testContent}\nEOF`
    ]);
    await log(`✓ 测试文件已写入: ${testFile}`);

    // 读取
    const readResult = await execFileAsync('docker', [
      'exec', CONTAINER_NAME,
      'cat', testFile
    ]);
    await log(`✓ 读取内容: ${readResult.stdout.trim()}`);

    // Test 4: 验证文件在容器重启后仍然存在
    await log('\n测试 4: 文件持久化验证（重启容器）...');
    await execFileAsync('docker', ['restart', CONTAINER_NAME]);
    await log(`✓ 容器已重启`);
    
    const verifyResult = await execFileAsync('docker', [
      'exec', CONTAINER_NAME,
      'cat', testFile
    ]);
    await log(`✓ 重启后文件仍然存在: ${verifyResult.stdout.trim()}`);

    // Test 5: 测试多个命令的执行
    await log('\n测试 5: Shell 命令执行...');
    const shellResult = await execFileAsync('docker', [
      'exec', '-w', WORKSPACE_PATH, CONTAINER_NAME,
      'bash', '-c', 'ls -la && echo "---" && pwd && echo "---" && echo $USER'
    ]);
    await log(`✓ Shell 命令执行结果:`);
    console.log(shellResult.stdout);

    await log('\n✅ 所有测试通过！工作区 API 已就绪。');

  } catch (e) {
    await log(`❌ 错误: ${String(e)}`);
    process.exit(1);
  }
}

// 运行测试
testWorkspaceAPI();
