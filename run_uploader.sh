#!/bin/bash

# ==============================================================================
# 脚本名称: run_uploader_with_nvm.sh
# 描述:     一个用于自动设置和通过 PM2 运行 irysuploader 工作流的脚本。
#           此版本会自动使用 NVM 安装和管理 Node.js。
#           https://github.com/SCAI-Foundation/irysuploader
# 作者:     YY
# 日期:     2025-06-29
# ==============================================================================

# --- 配置变量 ---
# GitHub 仓库地址
REPO_URL="https://github.com/SCAI-Foundation/irysuploader.git"
# 本地克隆的目录名
REPO_DIR="irysuploader"
# 需要在 PM2 中运行的 Node.js 脚本
NODE_SCRIPT="0_run_workflow.js"
# 在 PM2 中显示的进程名称
PM2_PROCESS_NAME="irys-uploader-workflow"
# 使用 NVM 安装的 Node.js 版本 ( '--lts' 会自动安装最新的长期支持版)
NODE_VERSION="--lts"

# --- 脚本开始 ---

# 设置颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== 开始执行 Irys Uploader 启动脚本 (集成 NVM) ===${NC}"

# --- 步骤 1: 检查核心依赖 (git, curl) ---
echo -e "\n${YELLOW}[步骤 1/6] 正在检查核心依赖 (git, curl)...${NC}"

# 检查 git
if ! command -v git &> /dev/null; then
    echo -e "${RED}错误: git 未安装。请先安装 git。${NC}"
    echo "例如 (Ubuntu/Debian): sudo apt-get install git"
    echo "例如 (CentOS/RHEL): sudo yum install git"
    exit 1
fi

# 检查 curl (NVM 安装需要)
if ! command -v curl &> /dev/null; then
    echo -e "${RED}错误: curl 未安装。请先安装 curl。${NC}"
    echo "例如 (Ubuntu/Debian): sudo apt-get install curl"
    echo "例如 (CentOS/RHEL): sudo yum install curl"
    exit 1
fi
echo -e "${GREEN}核心依赖检查通过。${NC}"


# --- 步骤 2: 检查并安装 Node.js (使用 NVM) ---
echo -e "\n${YELLOW}[步骤 2/6] 正在检查并设置 Node.js 环境...${NC}"

# 检查 Node.js 是否已存在
if ! command -v node &> /dev/null; then
    echo "未检测到 Node.js，将通过 NVM 进行安装..."

    # 安装 NVM
    # 从官网上拉取最新的安装脚本并执行
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

    # 为了在当前脚本中立即使用 nvm，需要手动 source nvm.sh
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

    echo "正在使用 NVM 安装 Node.js 版本: $NODE_VERSION..."
    nvm install "$NODE_VERSION"

    # 验证安装
    if ! command -v node &> /dev/null; then
        echo -e "${RED}错误: Node.js 安装失败。请检查 NVM 安装日志。${NC}"
        exit 1
    fi
    echo -e "${GREEN}Node.js $(node -v) 和 npm $(npm -v) 已成功安装。${NC}"
else
    echo -e "${GREEN}检测到已安装的 Node.js 版本: $(node -v)${NC}"
fi


# --- 步骤 3: 检查并安装 PM2 ---
echo -e "\n${YELLOW}[步骤 3/6] 正在检查 PM2...${NC}"

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
echo -e "\n${YELLOW}[步骤 4/6] 正在准备项目仓库...${NC}"

if [ ! -d "$REPO_DIR" ]; then
    echo "项目目录 '$REPO_DIR' 不存在，正在从 GitHub 克隆..."
    git clone "$REPO_URL"
    if [ $? -ne 0 ]; then
        echo -e "${RED}错误: 'git clone' 失败。请检查网络连接和仓库地址。${NC}"
        exit 1
    fi
else
    echo "项目目录 '$REPO_DIR' 已存在，正在拉取最新代码..."
    (cd "$REPO_DIR" && git pull)
fi
echo -e "${GREEN}仓库已是最新状态。${NC}"

# --- 步骤 5: 安装 Node.js 项目依赖 ---
echo -e "\n${YELLOW}[步骤 5/6] 正在安装 Node.js 项目依赖包...${NC}"
cd "$REPO_DIR" || exit 1
echo "当前目录: $(pwd)"
echo "执行 'npm install'..."
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 'npm install' 失败。请检查 package.json 文件和网络。${NC}"
    exit 1
fi
echo -e "${GREEN}Node.js 项目依赖包安装完成。${NC}"


# --- 步骤 6: 使用 PM2 启动脚本 ---
ARGS="$@"

echo -e "\n${YELLOW}[步骤 6/6] 正在使用 PM2 启动/重启 Node.js 脚本...${NC}"
echo "Node.js 脚本: $NODE_SCRIPT"
echo "PM2 进程名称: $PM2_PROCESS_NAME"
echo "传递的参数: $ARGS"

# 为了确保使用最新的参数启动，我们先删除旧的同名进程
pm2 delete "$PM2_PROCESS_NAME" >/dev/null 2>&1 || true

# 使用 pm2 启动脚本
# '--' 分隔符告诉 pm2 在此之后的所有内容都是要传递给 node 脚本的参数
pm2 start "$NODE_SCRIPT" --name "$PM2_PROCESS_NAME" -- $ARGS

if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 'pm2 start' 失败。请检查脚本路径和权限。${NC}"
    exit 1
fi

# --- 完成 ---
echo -e "\n${GREEN}操作成功! 脚本 '$NODE_SCRIPT' 已通过 PM2 在后台启动。${NC}"
echo -e "\n你可以使用以下命令来管理进程:"
echo -e "  - 查看所有进程状态: ${GREEN}pm2 list${NC}"
echo -e "  - 查看实时日志:      ${GREEN}pm2 logs $PM2_PROCESS_NAME${NC}"
echo -e "  - 停止进程:          ${GREEN}pm2 stop $PM2_PROCESS_NAME${NC}"
echo -e "  - 删除进程:          ${GREEN}pm2 delete $PM2_PROCESS_NAME${NC}"
echo -e "\n${GREEN}=== Irys Uploader 启动脚本执行完毕 ===${NC}"
