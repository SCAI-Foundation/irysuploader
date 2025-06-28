#!/bin/bash

# ==============================================================================
# 脚本名称: run_multi_uploader_final.sh
# 描述:     一个用于自动设置和通过 PM2 并发运行多个 irysuploader 工作流的脚本。
#           - 自动安装 NVM, Node.js, PM2
#           - 自动克隆/更新代码仓库
#           - 安全地提示输入和保存私钥到 .env 文件
#           - 支持通过命令行分隔符 '--' 运行两个独立的进程
# 作者:     YY
# 日期:     2025-06-28
# ==============================================================================

# --- 配置变量 ---
REPO_URL="https://github.com/SCAI-Foundation/irysuploader.git"
REPO_DIR="irysuploader"
NODE_SCRIPT="0_run_workflow.js"
NODE_VERSION="--lts"

# --- 脚本开始 ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== 开始执行 Irys Uploader 多进程启动脚本 (最终版) ===${NC}"

# --- 步骤 1: 检查核心依赖 (git, curl) ---
echo -e "\n${YELLOW}[步骤 1/7] 正在检查核心依赖 (git, curl)...${NC}"
if ! command -v git &> /dev/null; then
    echo -e "${RED}错误: git 未安装。请先安装 git。${NC}"
    exit 1
fi
if ! command -v curl &> /dev/null; then
    echo -e "${RED}错误: curl 未安装。请先安装 curl。${NC}"
    exit 1
fi
echo -e "${GREEN}核心依赖检查通过。${NC}"

# --- 步骤 2: 检查并安装 Node.js (使用 NVM) ---
echo -e "\n${YELLOW}[步骤 2/7] 正在检查并设置 Node.js 环境...${NC}"
if ! command -v node &> /dev/null; then
    echo "未检测到 Node.js，将通过 NVM 进行安装..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    echo "正在使用 NVM 安装 Node.js 版本: $NODE_VERSION..."
    nvm install "$NODE_VERSION"
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: Node.js 安装失败。${NC}"
        exit 1
    fi
    echo -e "${GREEN}Node.js $(node -v) 已成功安装。${NC}"
else
    echo -e "${GREEN}检测到已安装的 Node.js 版本: $(node -v)${NC}"
fi

# --- 步骤 3: 检查并安装 PM2 ---
echo -e "\n${YELLOW}[步骤 3/7] 正在检查 PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，正在使用 npm 全局安装..."
    if npm install pm2 -g; then
        echo -e "${GREEN}PM2 已成功安装。${NC}"
    else
        echo -e "${RED}错误: PM2 安装失败。请手动执行 'npm install pm2 -g'。${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}PM2 已安装。${NC}"
fi

# --- 步骤 4: 克隆或更新仓库 ---
echo -e "\n${YELLOW}[步骤 4/7] 正在准备项目仓库...${NC}"
if [ ! -d "$REPO_DIR" ]; then
    echo "项目目录 '$REPO_DIR' 不存在，正在从 GitHub 克隆..."
    git clone "$REPO_URL"
    if [ $? -ne 0 ]; then
        echo -e "${RED}错误: 'git clone' 失败。${NC}"; exit 1;
    fi
else
    echo "项目目录 '$REPO_DIR' 已存在，正在拉取最新代码..."
    (cd "$REPO_DIR" && git pull)
fi
echo -e "${GREEN}仓库已是最新状态。${NC}"

# --- 步骤 5: 安装 Node.js 项目依赖 ---
echo -e "\n${YELLOW}[步骤 5/7] 正在安装 Node.js 项目依赖包...${NC}"
cd "$REPO_DIR" || exit 1
echo "当前目录: $(pwd)"
echo "执行 'npm install'..."
npm install >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 'npm install' 失败。${NC}"; exit 1;
fi
echo -e "${GREEN}Node.js 项目依赖包安装完成。${NC}"

# --- 步骤 6: 检查并设置 .env 文件 ---
echo -e "\n${YELLOW}[步骤 6/7] 正在检查并设置 .env 环境变量...${NC}"
ENV_FILE=".env"
if [ -f "$ENV_FILE" ] && grep -q "^PRIVATE_KEY=." "$ENV_FILE"; then
    echo -e "${GREEN}✅ 检测到有效的 .env 文件和 PRIVATE_KEY，跳过输入。${NC}"
else
    echo -e "${YELLOW}未找到 .env 文件或 PRIVATE_KEY。${NC}"
    echo -n "请输入您的 Solana 私钥 (输入内容将被隐藏): "
    read -s SOLANA_PRIVATE_KEY
    echo
    if [ -z "$SOLANA_PRIVATE_KEY" ]; then
        echo -e "\n${RED}错误: 未输入任何内容，脚本终止。${NC}"; exit 1;
    fi
    echo "PRIVATE_KEY=${SOLANA_PRIVATE_KEY}" > "$ENV_FILE"
    echo -e "${GREEN}✅ 私钥已成功保存到 $(pwd)/$ENV_FILE 文件中。${NC}"
fi

# --- 步骤 7: 解析参数并启动 PM2 进程 ---
echo -e "\n${YELLOW}[步骤 7/7] 正在解析参数并启动 PM2 进程...${NC}"
ARGS1=()
ARGS2=()
CURRENT_ARGS="ARGS1"
for arg in "$@"; do
    if [[ "$arg" == "--" ]]; then
        CURRENT_ARGS="ARGS2"
        continue
    fi
    if [[ "$CURRENT_ARGS" == "ARGS1" ]]; then
        ARGS1+=("$arg")
    else
        ARGS2+=("$arg")
    fi
done

if [ ${#ARGS1[@]} -eq 0 ]; then
    echo -e "${RED}错误: 未提供任何参数。请提供至少一组运行参数。${NC}"
    exit 1
fi

# 启动第一个进程
PM2_PROCESS_NAME_1="irys-uploader-1"
echo "正在启动进程 1: $PM2_PROCESS_NAME_1"
echo "参数: ${ARGS1[*]}"
pm2 delete "$PM2_PROCESS_NAME_1" >/dev/null 2>&1 || true
pm2 start "$NODE_SCRIPT" --name "$PM2_PROCESS_NAME_1" -- ${ARGS1[@]}
if [ $? -ne 0 ]; then echo -e "${RED}进程1启动失败!${NC}"; exit 1; fi

# 启动第二个进程 (如果提供了参数)
if [ ${#ARGS2[@]} -gt 0 ]; then
    PM2_PROCESS_NAME_2="irys-uploader-2"
    echo "正在启动进程 2: $PM2_PROCESS_NAME_2"
    echo "参数: ${ARGS2[*]}"
    pm2 delete "$PM2_PROCESS_NAME_2" >/dev/null 2>&1 || true
    pm2 start "$NODE_SCRIPT" --name "$PM2_PROCESS_NAME_2" -- ${ARGS2[@]}
    if [ $? -ne 0 ]; then echo -e "${RED}进程2启动失败!${NC}"; exit 1; fi
fi

# --- 完成 ---
echo -e "\n${GREEN}=== 所有进程均已启动 ===${NC}"
echo "使用 'pm2 list' 查看状态。"
echo "使用 'pm2 logs [进程名]' 查看日志，例如 'pm2 logs irys-uploader-1'。"
