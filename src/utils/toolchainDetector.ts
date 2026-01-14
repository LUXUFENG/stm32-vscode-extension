import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

export interface DetectedTools {
    gccPath?: string;
    openocdPath?: string;
    openocdScriptsPath?: string;
    cmakePath?: string;
    ninjaPath?: string;
    gccVersion?: string;
    openocdVersion?: string;
}

export class ToolchainDetector {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('STM32 Toolchain');
    }

    private log(message: string): void {
        this.outputChannel.appendLine(message);
    }

    /**
     * 自动检测所有工具
     */
    async detectAll(): Promise<DetectedTools> {
        this.log('开始自动检测工具链...');
        
        const tools: DetectedTools = {};

        // 检测 GCC ARM
        const gccResult = await this.detectGccArm();
        if (gccResult) {
            tools.gccPath = gccResult.path;
            tools.gccVersion = gccResult.version;
            this.log(`✓ 找到 GCC ARM: ${gccResult.path} (${gccResult.version})`);
        } else {
            this.log('✗ 未找到 GCC ARM 工具链');
        }

        // 检测 OpenOCD
        const openocdResult = await this.detectOpenOCD();
        if (openocdResult) {
            tools.openocdPath = openocdResult.path;
            tools.openocdScriptsPath = openocdResult.scriptsPath;
            tools.openocdVersion = openocdResult.version;
            this.log(`✓ 找到 OpenOCD: ${openocdResult.path} (${openocdResult.version})`);
        } else {
            this.log('✗ 未找到 OpenOCD');
        }

        // 检测 CMake
        const cmakeResult = await this.detectCMake();
        if (cmakeResult) {
            tools.cmakePath = cmakeResult.path;
            this.log(`✓ 找到 CMake: ${cmakeResult.path} (${cmakeResult.version})`);
        } else {
            this.log('✗ 未找到 CMake');
        }

        // 检测 Ninja
        const ninjaResult = await this.detectNinja();
        if (ninjaResult) {
            tools.ninjaPath = ninjaResult.path;
            this.log(`✓ 找到 Ninja: ${ninjaResult.path} (${ninjaResult.version})`);
        } else {
            this.log('✗ 未找到 Ninja');
        }

        this.log('工具链检测完成');
        return tools;
    }

    /**
     * 检测 GCC ARM 工具链
     */
    async detectGccArm(): Promise<{ path: string; version: string } | null> {
        const gccNames = ['arm-none-eabi-gcc', 'arm-none-eabi-gcc.exe'];
        
        // 常见安装路径
        const commonPaths = this.getCommonGccPaths();

        // 先从 PATH 中查找
        for (const name of gccNames) {
            const result = this.findInPath(name);
            if (result) {
                const version = this.getGccVersion(result);
                return { path: path.dirname(result), version };
            }
        }

        // 在常见路径中查找
        for (const basePath of commonPaths) {
            if (fs.existsSync(basePath)) {
                // 查找包含 arm-none-eabi 的目录
                const dirs = this.findDirectories(basePath, /arm-none-eabi|gcc-arm/i);
                for (const dir of dirs) {
                    const binPath = path.join(dir, 'bin');
                    const gccExe = path.join(binPath, 'arm-none-eabi-gcc.exe');
                    const gccUnix = path.join(binPath, 'arm-none-eabi-gcc');
                    
                    if (fs.existsSync(gccExe)) {
                        const version = this.getGccVersion(gccExe);
                        return { path: binPath, version };
                    }
                    if (fs.existsSync(gccUnix)) {
                        const version = this.getGccVersion(gccUnix);
                        return { path: binPath, version };
                    }
                }
            }
        }

        return null;
    }

    /**
     * 检测 OpenOCD
     */
    async detectOpenOCD(): Promise<{ path: string; scriptsPath: string; version: string } | null> {
        const openocdNames = ['openocd', 'openocd.exe'];
        
        // 常见安装路径
        const commonPaths = this.getCommonOpenOCDPaths();

        // 先从 PATH 中查找
        for (const name of openocdNames) {
            const result = this.findInPath(name);
            if (result) {
                const version = this.getOpenOCDVersion(result);
                const scriptsPath = this.findOpenOCDScripts(path.dirname(result));
                return { path: result, scriptsPath, version };
            }
        }

        // 在常见路径中查找
        for (const basePath of commonPaths) {
            if (fs.existsSync(basePath)) {
                const dirs = this.findDirectories(basePath, /openocd|xpack/i);
                for (const dir of dirs) {
                    const binPath = path.join(dir, 'bin');
                    const openocdExe = path.join(binPath, 'openocd.exe');
                    const openocdUnix = path.join(binPath, 'openocd');
                    
                    let exePath: string | null = null;
                    if (fs.existsSync(openocdExe)) {
                        exePath = openocdExe;
                    } else if (fs.existsSync(openocdUnix)) {
                        exePath = openocdUnix;
                    }

                    if (exePath) {
                        const version = this.getOpenOCDVersion(exePath);
                        const scriptsPath = this.findOpenOCDScripts(dir);
                        return { path: exePath, scriptsPath, version };
                    }
                }
            }
        }

        return null;
    }

    /**
     * 检测 CMake
     */
    async detectCMake(): Promise<{ path: string; version: string } | null> {
        const cmakeNames = ['cmake', 'cmake.exe'];
        
        // 从 PATH 中查找
        for (const name of cmakeNames) {
            const result = this.findInPath(name);
            if (result) {
                const version = this.getCMakeVersion(result);
                return { path: result, version };
            }
        }

        // 常见路径
        const commonPaths = [
            'C:\\Program Files\\CMake\\bin\\cmake.exe',
            'C:\\Program Files (x86)\\CMake\\bin\\cmake.exe',
            '/usr/bin/cmake',
            '/usr/local/bin/cmake',
            '/opt/homebrew/bin/cmake'
        ];

        for (const cmakePath of commonPaths) {
            if (fs.existsSync(cmakePath)) {
                const version = this.getCMakeVersion(cmakePath);
                return { path: cmakePath, version };
            }
        }

        return null;
    }

    /**
     * 检测 Ninja
     */
    async detectNinja(): Promise<{ path: string; version: string } | null> {
        const ninjaNames = ['ninja', 'ninja.exe'];
        
        // 从 PATH 中查找
        for (const name of ninjaNames) {
            const result = this.findInPath(name);
            if (result) {
                const version = this.getNinjaVersion(result);
                return { path: result, version };
            }
        }

        // 常见路径
        const commonPaths = this.getCommonNinjaPaths();
        
        for (const basePath of commonPaths) {
            if (fs.existsSync(basePath)) {
                const ninjaExe = path.join(basePath, 'ninja.exe');
                const ninjaUnix = path.join(basePath, 'ninja');
                
                if (fs.existsSync(ninjaExe)) {
                    const version = this.getNinjaVersion(ninjaExe);
                    return { path: ninjaExe, version };
                }
                if (fs.existsSync(ninjaUnix)) {
                    const version = this.getNinjaVersion(ninjaUnix);
                    return { path: ninjaUnix, version };
                }
            }
        }

        return null;
    }

    /**
     * 获取常见的 GCC ARM 安装路径
     */
    private getCommonGccPaths(): string[] {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const paths: string[] = [];

        if (process.platform === 'win32') {
            paths.push(
                'C:\\',
                'C:\\Program Files',
                'C:\\Program Files (x86)',
                'D:\\',
                'D:\\Program Files',
                path.join(home, 'AppData', 'Local'),
                path.join(home, 'scoop', 'apps'),
                // STM32CubeIDE 内置工具链
                'C:\\ST\\STM32CubeIDE_1.13.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.14.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.15.0\\STM32CubeIDE\\plugins',
                // xpack 路径
                path.join(home, 'AppData', 'Roaming', 'xPacks', '@xpack-dev-tools', 'arm-none-eabi-gcc'),
            );
        } else {
            paths.push(
                '/usr/local',
                '/opt',
                '/usr',
                path.join(home, '.local'),
                // xpack 路径
                path.join(home, '.local', 'xPacks', '@xpack-dev-tools', 'arm-none-eabi-gcc'),
                '/Applications/ARM', // macOS
            );
        }

        return paths;
    }

    /**
     * 获取常见的 OpenOCD 安装路径
     */
    private getCommonOpenOCDPaths(): string[] {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const paths: string[] = [];

        if (process.platform === 'win32') {
            paths.push(
                'C:\\',
                'C:\\Program Files',
                'C:\\Program Files (x86)',
                'D:\\',
                path.join(home, 'AppData', 'Local'),
                path.join(home, 'scoop', 'apps'),
                // STM32CubeIDE 内置 OpenOCD
                'C:\\ST\\STM32CubeIDE_1.13.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.14.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.15.0\\STM32CubeIDE\\plugins',
                // xpack 路径
                path.join(home, 'AppData', 'Roaming', 'xPacks', '@xpack-dev-tools', 'openocd'),
            );
        } else {
            paths.push(
                '/usr/local',
                '/opt',
                '/usr',
                path.join(home, '.local'),
                path.join(home, '.local', 'xPacks', '@xpack-dev-tools', 'openocd'),
                '/Applications', // macOS
            );
        }

        return paths;
    }

    /**
     * 获取常见的 Ninja 安装路径
     */
    private getCommonNinjaPaths(): string[] {
        const home = process.env.HOME || process.env.USERPROFILE || '';
        const paths: string[] = [];

        if (process.platform === 'win32') {
            paths.push(
                'C:\\ninja',
                'C:\\Program Files\\ninja',
                path.join(home, 'scoop', 'apps', 'ninja', 'current'),
                path.join(home, 'AppData', 'Local', 'Programs', 'ninja'),
                // CMake 可能包含 ninja
                'C:\\Program Files\\CMake\\bin',
            );
        } else {
            paths.push(
                '/usr/bin',
                '/usr/local/bin',
                '/opt/homebrew/bin',
                path.join(home, '.local', 'bin'),
            );
        }

        return paths;
    }

    /**
     * 在 PATH 环境变量中查找可执行文件
     */
    private findInPath(name: string): string | null {
        const pathEnv = process.env.PATH || '';
        const pathSeparator = process.platform === 'win32' ? ';' : ':';
        const paths = pathEnv.split(pathSeparator);

        for (const p of paths) {
            const fullPath = path.join(p, name);
            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
        }

        // Windows: 尝试使用 where 命令
        if (process.platform === 'win32') {
            try {
                const result = execSync(`where ${name}`, { encoding: 'utf8', timeout: 5000 });
                const firstLine = result.split('\n')[0].trim();
                if (firstLine && fs.existsSync(firstLine)) {
                    return firstLine;
                }
            } catch {
                // 忽略
            }
        } else {
            // Unix: 尝试使用 which 命令
            try {
                const result = execSync(`which ${name}`, { encoding: 'utf8', timeout: 5000 });
                const firstLine = result.trim();
                if (firstLine && fs.existsSync(firstLine)) {
                    return firstLine;
                }
            } catch {
                // 忽略
            }
        }

        return null;
    }

    /**
     * 在目录中查找匹配的子目录
     */
    private findDirectories(basePath: string, pattern: RegExp, maxDepth: number = 3): string[] {
        const results: string[] = [];
        
        const search = (dir: string, depth: number) => {
            if (depth > maxDepth) return;
            
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const fullPath = path.join(dir, entry.name);
                        if (pattern.test(entry.name)) {
                            results.push(fullPath);
                        }
                        // 继续递归搜索
                        if (depth < maxDepth) {
                            search(fullPath, depth + 1);
                        }
                    }
                }
            } catch {
                // 忽略权限错误
            }
        };

        search(basePath, 0);
        return results;
    }

    /**
     * 查找 OpenOCD scripts 目录
     */
    private findOpenOCDScripts(basePath: string): string {
        const possiblePaths = [
            path.join(basePath, 'share', 'openocd', 'scripts'),
            path.join(basePath, '..', 'share', 'openocd', 'scripts'),
            path.join(basePath, 'scripts'),
            path.join(basePath, '..', 'scripts'),
        ];

        for (const p of possiblePaths) {
            const resolved = path.resolve(p);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }

        return '';
    }

    /**
     * 获取 GCC 版本
     */
    private getGccVersion(gccPath: string): string {
        try {
            const result = execSync(`"${gccPath}" --version`, { encoding: 'utf8', timeout: 5000 });
            const match = result.match(/(\d+\.\d+\.\d+)/);
            return match ? match[1] : 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 获取 OpenOCD 版本
     */
    private getOpenOCDVersion(openocdPath: string): string {
        try {
            const result = execSync(`"${openocdPath}" --version`, { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
            const match = result.match(/(\d+\.\d+\.\d+)/);
            return match ? match[1] : 'unknown';
        } catch (e: unknown) {
            // OpenOCD 将版本信息输出到 stderr
            const error = e as { stderr?: Buffer };
            if (error.stderr) {
                const stderr = error.stderr.toString();
                const match = stderr.match(/(\d+\.\d+\.\d+)/);
                return match ? match[1] : 'unknown';
            }
            return 'unknown';
        }
    }

    /**
     * 获取 CMake 版本
     */
    private getCMakeVersion(cmakePath: string): string {
        try {
            const result = execSync(`"${cmakePath}" --version`, { encoding: 'utf8', timeout: 5000 });
            const match = result.match(/(\d+\.\d+\.\d+)/);
            return match ? match[1] : 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 获取 Ninja 版本
     */
    private getNinjaVersion(ninjaPath: string): string {
        try {
            const result = execSync(`"${ninjaPath}" --version`, { encoding: 'utf8', timeout: 5000 });
            return result.trim() || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    /**
     * 应用检测到的工具配置
     */
    async applyDetectedTools(tools: DetectedTools): Promise<void> {
        const config = vscode.workspace.getConfiguration('stm32');

        if (tools.gccPath) {
            await config.update('toolchainPath', tools.gccPath, vscode.ConfigurationTarget.Global);
        }
        if (tools.openocdPath) {
            await config.update('openocdPath', tools.openocdPath, vscode.ConfigurationTarget.Global);
        }
        if (tools.openocdScriptsPath) {
            await config.update('openocdScriptsPath', tools.openocdScriptsPath, vscode.ConfigurationTarget.Global);
        }
        if (tools.cmakePath) {
            await config.update('cmakePath', tools.cmakePath, vscode.ConfigurationTarget.Global);
        }
    }

    /**
     * 显示检测结果并询问是否应用
     */
    async showDetectionResultsAndApply(): Promise<void> {
        this.outputChannel.show();
        
        const tools = await this.detectAll();

        const foundTools: string[] = [];
        const missingTools: string[] = [];

        if (tools.gccPath) {
            foundTools.push(`GCC ARM: ${tools.gccPath} (v${tools.gccVersion})`);
        } else {
            missingTools.push('GCC ARM');
        }

        if (tools.openocdPath) {
            foundTools.push(`OpenOCD: ${tools.openocdPath} (v${tools.openocdVersion})`);
        } else {
            missingTools.push('OpenOCD');
        }

        if (tools.cmakePath) {
            foundTools.push(`CMake: ${tools.cmakePath}`);
        } else {
            missingTools.push('CMake');
        }

        if (tools.ninjaPath) {
            foundTools.push(`Ninja: ${tools.ninjaPath}`);
        } else {
            missingTools.push('Ninja');
        }

        let message = '';
        if (foundTools.length > 0) {
            message = `找到以下工具:\n${foundTools.join('\n')}`;
            if (missingTools.length > 0) {
                message += `\n\n未找到: ${missingTools.join(', ')}`;
            }
        } else {
            message = '未找到任何工具，请手动配置。';
            vscode.window.showWarningMessage(message);
            return;
        }

        const choice = await vscode.window.showInformationMessage(
            `${message}\n\n是否应用这些配置?`,
            { modal: true },
            '应用配置',
            '取消'
        );

        if (choice === '应用配置') {
            await this.applyDetectedTools(tools);
            vscode.window.showInformationMessage('工具链配置已更新！');
        }
    }
}

