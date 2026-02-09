/**
 * 工具链检测器
 * 自动检测 GCC ARM、OpenOCD、CMake、Ninja 等开发工具
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { updateSTM32ConfigBatch } from './config';
import { ToolchainInstaller, ToolName, getMissingTools, getToolDisplayName } from './toolchainInstaller';

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
    private installer?: ToolchainInstaller;
    private toolsDir?: string;

    constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('STM32 Toolchain');
    }

    setInstaller(installer: ToolchainInstaller): void {
        this.installer = installer;
        this.toolsDir = installer.toolsDir;
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
        const ext = process.platform === 'win32' ? '.exe' : '';

        // 优先检查扩展已安装的工具
        if (this.toolsDir) {
            const gccBin = path.join(this.toolsDir, 'gcc-arm', 'bin', `arm-none-eabi-gcc${ext}`);
            if (fs.existsSync(gccBin)) {
                tools.gccPath = path.dirname(gccBin);
                tools.gccVersion = this.getGccVersion(gccBin);
                this.log(`✓ 找到 GCC ARM (扩展安装): ${tools.gccPath} (${tools.gccVersion})`);
            }
            const openocdBin = path.join(this.toolsDir, 'openocd', 'bin', `openocd${ext}`);
            if (fs.existsSync(openocdBin)) {
                tools.openocdPath = openocdBin;
                tools.openocdScriptsPath = this.findOpenOCDScripts(path.join(this.toolsDir, 'openocd'));
                tools.openocdVersion = this.getOpenOCDVersion(openocdBin);
                this.log(`✓ 找到 OpenOCD (扩展安装): ${openocdBin} (${tools.openocdVersion})`);
            }
            const cmakeBin = path.join(this.toolsDir, 'cmake', 'bin', `cmake${ext}`);
            if (fs.existsSync(cmakeBin)) {
                tools.cmakePath = cmakeBin;
                this.log(`✓ 找到 CMake (扩展安装): ${cmakeBin}`);
            }
            const ninjaBin = path.join(this.toolsDir, 'ninja', `ninja${ext}`);
            if (fs.existsSync(ninjaBin)) {
                tools.ninjaPath = ninjaBin;
                this.log(`✓ 找到 Ninja (扩展安装): ${ninjaBin}`);
            }
        }

        // 对未找到的工具，继续搜索系统
        if (!tools.gccPath) {
            const gccResult = await this.detectGccArm();
            if (gccResult) {
                tools.gccPath = gccResult.path;
                tools.gccVersion = gccResult.version;
                this.log(`✓ 找到 GCC ARM: ${gccResult.path} (${gccResult.version})`);
            } else {
                this.log('✗ 未找到 GCC ARM 工具链');
            }
        }

        if (!tools.openocdPath) {
            const openocdResult = await this.detectOpenOCD();
            if (openocdResult) {
                tools.openocdPath = openocdResult.path;
                tools.openocdScriptsPath = openocdResult.scriptsPath;
                tools.openocdVersion = openocdResult.version;
                this.log(`✓ 找到 OpenOCD: ${openocdResult.path} (${openocdResult.version})`);
            } else {
                this.log('✗ 未找到 OpenOCD');
            }
        }

        if (!tools.cmakePath) {
            const cmakeResult = await this.detectCMake();
            if (cmakeResult) {
                tools.cmakePath = cmakeResult.path;
                this.log(`✓ 找到 CMake: ${cmakeResult.path} (${cmakeResult.version})`);
            } else {
                this.log('✗ 未找到 CMake');
            }
        }

        if (!tools.ninjaPath) {
            const ninjaResult = await this.detectNinja();
            if (ninjaResult) {
                tools.ninjaPath = ninjaResult.path;
                this.log(`✓ 找到 Ninja: ${ninjaResult.path} (${ninjaResult.version})`);
            } else {
                this.log('✗ 未找到 Ninja');
            }
        }

        this.log('工具链检测完成');
        return tools;
    }

    /**
     * 检测 GCC ARM 工具链
     */
    async detectGccArm(): Promise<{ path: string; version: string } | null> {
        const gccNames = ['arm-none-eabi-gcc', 'arm-none-eabi-gcc.exe'];
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
                'C:\\ST\\STM32CubeIDE_1.13.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.14.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.15.0\\STM32CubeIDE\\plugins',
                path.join(home, 'AppData', 'Roaming', 'xPacks', '@xpack-dev-tools', 'arm-none-eabi-gcc'),
            );
        } else {
            paths.push(
                '/usr/local',
                '/opt',
                '/usr',
                path.join(home, '.local'),
                path.join(home, '.local', 'xPacks', '@xpack-dev-tools', 'arm-none-eabi-gcc'),
                '/Applications/ARM',
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
                'C:\\ST\\STM32CubeIDE_1.13.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.14.0\\STM32CubeIDE\\plugins',
                'C:\\ST\\STM32CubeIDE_1.15.0\\STM32CubeIDE\\plugins',
                path.join(home, 'AppData', 'Roaming', 'xPacks', '@xpack-dev-tools', 'openocd'),
            );
        } else {
            paths.push(
                '/usr/local',
                '/opt',
                '/usr',
                path.join(home, '.local'),
                path.join(home, '.local', 'xPacks', '@xpack-dev-tools', 'openocd'),
                '/Applications',
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

        // 使用系统命令查找
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
        await updateSTM32ConfigBatch({
            toolchainPath: tools.gccPath,
            openocdPath: tools.openocdPath,
            openocdScriptsPath: tools.openocdScriptsPath,
            cmakePath: tools.cmakePath,
            ninjaPath: tools.ninjaPath
        }, vscode.ConfigurationTarget.Global);

        const cmakeToolsConfig = vscode.workspace.getConfiguration('cmake');

        if (tools.cmakePath) {
            const current = cmakeToolsConfig.get<string>('cmakePath');
            if (!current || current === 'cmake') {
                await cmakeToolsConfig.update('cmakePath', tools.cmakePath, vscode.ConfigurationTarget.Global);
                this.log(`已同步设置 cmake.cmakePath = ${tools.cmakePath}`);
            }
        }

        if (tools.ninjaPath) {
            const ninjaArg = `-DCMAKE_MAKE_PROGRAM=${tools.ninjaPath}`;
            const configureArgs = cmakeToolsConfig.get<string[]>('configureArgs') || [];
            const filtered = configureArgs.filter(a => !a.startsWith('-DCMAKE_MAKE_PROGRAM='));
            filtered.push(ninjaArg);
            await cmakeToolsConfig.update('configureArgs', filtered, vscode.ConfigurationTarget.Global);
            this.log(`已同步设置 cmake.configureArgs: ${ninjaArg}`);
        }

        const extraPaths: string[] = [];
        if (tools.gccPath) { extraPaths.push(tools.gccPath); }
        if (tools.ninjaPath) { extraPaths.push(path.dirname(tools.ninjaPath)); }
        if (tools.cmakePath) { extraPaths.push(path.dirname(tools.cmakePath)); }

        if (extraPaths.length > 0) {
            const cmakeEnv = cmakeToolsConfig.get<Record<string, string>>('environment') || {};
            cmakeEnv['PATH'] = [...extraPaths, process.env.PATH || ''].join(path.delimiter);
            await cmakeToolsConfig.update('environment', cmakeEnv, vscode.ConfigurationTarget.Global);
            this.log(`已同步设置 cmake.environment.PATH`);
        }
    }

    /**
     * 显示检测结果并询问是否应用
     */
    async showDetectionResultsAndApply(): Promise<void> {
        this.outputChannel.show();

        const tools = await this.detectAll();
        const missing = getMissingTools(tools);

        const foundTools: string[] = [];
        const missingNames: string[] = [];

        if (tools.gccPath) {
            foundTools.push(`GCC ARM: ${tools.gccPath} (v${tools.gccVersion})`);
        } else {
            missingNames.push('GCC ARM');
        }
        if (tools.openocdPath) {
            foundTools.push(`OpenOCD: ${tools.openocdPath} (v${tools.openocdVersion})`);
        } else {
            missingNames.push('OpenOCD');
        }
        if (tools.cmakePath) {
            foundTools.push(`CMake: ${tools.cmakePath}`);
        } else {
            missingNames.push('CMake');
        }
        if (tools.ninjaPath) {
            foundTools.push(`Ninja: ${tools.ninjaPath}`);
        } else {
            missingNames.push('Ninja');
        }

        if (missing.length === 0) {
            await this.applyDetectedTools(tools);
            vscode.window.showInformationMessage('所有工具已找到，配置已更新！');
            return;
        }

        let message = '';
        if (foundTools.length > 0) {
            message = `找到: ${foundTools.join(', ')}\n未找到: ${missingNames.join(', ')}`;
        } else {
            message = `未找到任何工具: ${missingNames.join(', ')}`;
        }

        const options: string[] = [];
        if (this.installer) {
            options.push('自动安装缺失工具');
        }
        if (foundTools.length > 0) {
            options.push('仅应用已找到的');
        }
        options.push('取消');

        const choice = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            ...options
        );

        if (choice === '自动安装缺失工具' && this.installer) {
            if (foundTools.length > 0) {
                await this.applyDetectedTools(tools);
            }
            const installed = await this.installer.installMissing(missing);
            await this.applyDetectedTools(installed);
            vscode.window.showInformationMessage('工具链安装完成！');
        } else if (choice === '仅应用已找到的') {
            await this.applyDetectedTools(tools);
            vscode.window.showInformationMessage('工具链配置已更新！');
        }
    }
}
