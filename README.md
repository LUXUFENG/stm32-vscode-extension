# STM32 Development Tools for VS Code

一个功能强大的 VS Code 扩展，用于 STM32 微控制器开发，支持 CMake 构建、GCC-ARM 编译和 OpenOCD 调试。

## ✨ 功能特性

### 🔧 编译构建
- **CMake 集成**: 完整的 CMake 项目支持
- **GCC-ARM 工具链**: 支持 arm-none-eabi-gcc 编译器
- **Ninja 构建**: 快速并行编译
- **一键编译**: 编译、清理、重新编译

### 🐛 调试下载
- **OpenOCD 集成**: 支持多种调试器
  - ST-Link V2/V2-1/V3
  - J-Link
  - CMSIS-DAP
- **程序下载**: 一键烧录固件到芯片
- **在线调试**: 支持断点、单步、查看变量

### 📟 芯片支持
- STM32F0 系列 (Cortex-M0)
- STM32F1 系列 (Cortex-M3)
- STM32F2 系列 (Cortex-M3)
- STM32F3 系列 (Cortex-M4)
- STM32F4 系列 (Cortex-M4)
- STM32F7 系列 (Cortex-M7)
- STM32G0 系列 (Cortex-M0+)
- STM32G4 系列 (Cortex-M4)
- STM32H7 系列 (Cortex-M7)
- STM32L0/L1/L4/L5 系列
- STM32U5 系列
- STM32WB 系列

### 👁️ 寄存器查看
- **核心寄存器**: R0-R15, xPSR 等
- **外设寄存器**: GPIO, USART, TIM, SPI, I2C 等
- **SVD 文件支持**: 自动解析外设寄存器定义

## 📦 安装要求

### 必需工具

1. **GCC ARM 工具链**
   ```
   下载地址: https://developer.arm.com/tools-and-software/open-source-software/developer-tools/gnu-toolchain/gnu-rm
   ```

2. **OpenOCD**
   ```
   下载地址: https://github.com/xpack-dev-tools/openocd-xpack/releases
   ```

3. **CMake**
   ```
   下载地址: https://cmake.org/download/
   ```

4. **Ninja** (推荐)
   ```
   下载地址: https://github.com/ninja-build/ninja/releases
   ```

### 推荐扩展

- [Cortex-Debug](https://marketplace.visualstudio.com/items?itemName=marus25.cortex-debug) - 增强的 ARM 调试支持
- [C/C++](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools) - C/C++ 语言支持
- [CMake Tools](https://marketplace.visualstudio.com/items?itemName=ms-vscode.cmake-tools) - CMake 扩展

## 🚀 快速开始

### 1. 自动检测工具链 ✨

扩展支持**自动检测**本地安装的工具链：

1. 首次启动时，扩展会询问是否自动查找工具链
2. 或者按 `Ctrl+Shift+P`，运行 **"STM32: 自动检测工具链"**
3. 扩展会在以下位置搜索：
   - PATH 环境变量
   - 常见安装目录 (C:\, D:\, Program Files 等)
   - STM32CubeIDE 内置工具链
   - xPack 工具链目录
   - Scoop 安装目录

**自动检测的工具：**
- GCC ARM (arm-none-eabi-gcc)
- OpenOCD
- CMake
- Ninja

### 1b. 手动配置工具链路径

如果自动检测失败，可以手动配置。打开设置 (`Ctrl+,`)，搜索 "STM32"：

```json
{
    "stm32.toolchainPath": "C:/gcc-arm-none-eabi/bin",
    "stm32.openocdPath": "C:/openocd/bin/openocd.exe",
    "stm32.openocdScriptsPath": "C:/openocd/share/openocd/scripts"
}
```

### 2. 选择芯片型号

1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "STM32: 选择芯片型号"
3. 先选择芯片系列，再选择具体型号

### 3. 编译项目

1. 确保项目根目录有 `CMakeLists.txt`
2. 按 `Ctrl+Shift+P`，选择 "STM32: 编译项目"
3. 或点击侧边栏 STM32 面板中的"编译项目"

### 4. 下载程序

1. 连接调试器（如 ST-Link）
2. 按 `Ctrl+Shift+P`，选择 "STM32: 下载程序到芯片"

### 5. 开始调试

1. 按 `Ctrl+Shift+P`，选择 "STM32: 生成调试配置"
2. 按 `F5` 开始调试

## ⚙️ 配置选项

| 设置项 | 描述 | 默认值 |
|--------|------|--------|
| `stm32.toolchainPath` | GCC ARM 工具链路径 | (空，使用 PATH) |
| `stm32.openocdPath` | OpenOCD 可执行文件路径 | openocd |
| `stm32.openocdScriptsPath` | OpenOCD 脚本目录 | (空) |
| `stm32.cmakePath` | CMake 可执行文件路径 | cmake |
| `stm32.selectedChip` | 当前选择的芯片型号 | (空) |
| `stm32.debugInterface` | 调试器接口类型 | stlink |
| `stm32.buildType` | CMake 构建类型 | Debug |
| `stm32.buildDirectory` | 构建输出目录 | build |
| `stm32.elfFile` | ELF 文件路径 | (自动检测) |
| `stm32.svdFile` | SVD 文件路径 | (空) |

## 📋 命令列表

| 命令 | 描述 |
|------|------|
| `STM32: 自动检测工具链` | 🔍 自动查找本地安装的 GCC/OpenOCD/Ninja |
| `STM32: 选择芯片型号` | 选择目标 STM32 芯片 |
| `STM32: 编译项目` | 使用 CMake 编译项目 |
| `STM32: 清理项目` | 清理构建目录 |
| `STM32: 重新编译` | 清理并重新编译 |
| `STM32: 下载程序到芯片` | 使用 OpenOCD 烧录程序 |
| `STM32: 开始调试` | 启动调试会话 |
| `STM32: 启动 OpenOCD 服务` | 启动 OpenOCD 服务器 |
| `STM32: 停止 OpenOCD 服务` | 停止 OpenOCD 服务器 |
| `STM32: 生成调试配置` | 生成 launch.json 配置 |
| `STM32: 刷新寄存器` | 刷新寄存器视图 |

## 📁 项目结构示例

```
my-stm32-project/
├── CMakeLists.txt          # CMake 配置文件
├── src/
│   ├── main.c              # 主程序
│   └── stm32f1xx_it.c      # 中断处理
├── inc/
│   └── stm32f1xx_hal_conf.h
├── startup/
│   └── startup_stm32f103xb.s
├── STM32F103C8Tx_FLASH.ld  # 链接脚本
├── .vscode/
│   ├── launch.json         # 调试配置
│   └── tasks.json          # 任务配置
└── build/                  # 构建输出目录
```

## 🔨 CMakeLists.txt 示例

```cmake
cmake_minimum_required(VERSION 3.20)

# 设置工具链
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR ARM)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)

# 编译器设置
set(CMAKE_C_COMPILER arm-none-eabi-gcc)
set(CMAKE_CXX_COMPILER arm-none-eabi-g++)
set(CMAKE_ASM_COMPILER arm-none-eabi-gcc)
set(CMAKE_OBJCOPY arm-none-eabi-objcopy)
set(CMAKE_SIZE arm-none-eabi-size)

project(my_stm32_project C CXX ASM)

# 芯片相关定义
set(MCU_FAMILY STM32F1xx)
set(MCU_MODEL STM32F103xB)
set(CPU_PARAMETERS
    -mcpu=cortex-m3
    -mthumb
)

# 编译选项
add_compile_options(
    ${CPU_PARAMETERS}
    -Wall
    -fdata-sections
    -ffunction-sections
    $<$<CONFIG:Debug>:-Og -g3>
    $<$<CONFIG:Release>:-Os>
)

# 定义
add_compile_definitions(
    ${MCU_MODEL}
    USE_HAL_DRIVER
)

# 包含目录
include_directories(
    inc
    Drivers/STM32F1xx_HAL_Driver/Inc
    Drivers/CMSIS/Include
    Drivers/CMSIS/Device/ST/STM32F1xx/Include
)

# 源文件
file(GLOB_RECURSE SOURCES
    "src/*.c"
    "Drivers/STM32F1xx_HAL_Driver/Src/*.c"
    "startup/*.s"
)

# 链接脚本
set(LINKER_SCRIPT ${CMAKE_SOURCE_DIR}/STM32F103C8Tx_FLASH.ld)

# 链接选项
add_link_options(
    ${CPU_PARAMETERS}
    -T${LINKER_SCRIPT}
    -Wl,--gc-sections
    -Wl,--print-memory-usage
    --specs=nano.specs
    --specs=nosys.specs
)

# 可执行文件
add_executable(${PROJECT_NAME}.elf ${SOURCES})

# 生成 HEX 和 BIN 文件
add_custom_command(TARGET ${PROJECT_NAME}.elf POST_BUILD
    COMMAND ${CMAKE_OBJCOPY} -O ihex ${PROJECT_NAME}.elf ${PROJECT_NAME}.hex
    COMMAND ${CMAKE_OBJCOPY} -O binary ${PROJECT_NAME}.elf ${PROJECT_NAME}.bin
    COMMAND ${CMAKE_SIZE} ${PROJECT_NAME}.elf
)
```

## 🐞 故障排除

### OpenOCD 无法连接

1. 检查调试器是否正确连接
2. 确认驱动程序已安装
3. 检查 OpenOCD 配置文件路径是否正确
4. 尝试降低调试速度：在 launch.json 中添加 `"openOCDLaunchCommands": ["adapter speed 1000"]`

### 编译错误

1. 检查工具链路径是否正确
2. 确认 CMakeLists.txt 配置正确
3. 检查芯片型号是否匹配

### 无法下载程序

1. 确认 ELF 文件已生成
2. 检查芯片是否被锁定
3. 尝试先擦除芯片

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

如有问题，请在 GitHub Issues 中反馈。

