#!/bin/bash
# LabMate 部署到 GitHub Pages
# 前置条件：已安装 git，已登录 gh CLI（gh auth login）

set -e
REPO="Gashen0/labmate"
BRANCH=$(git branch --show-current 2>/dev/null || echo "main")

echo "=== LabMate Deploy ==="

# 检查登录
if command -v gh &>/dev/null; then
    if ! gh auth status &>/dev/null 2>&1; then
        echo "请先运行: gh auth login"
        exit 1
    fi
    # 确保远程正确
    git remote get-url origin &>/dev/null || git remote add origin "https://github.com/$REPO.git"
    git remote set-url origin "https://github.com/$REPO.git"
fi

# 推送
echo "推送到 $REPO ($BRANCH)..."
git push -u origin "$BRANCH"

# 启用 Pages
if command -v gh &>/dev/null; then
    echo "启用 GitHub Pages..."
    gh api "repos/$REPO/pages" -X POST -f "source[branch]=$BRANCH" -f "source[path]=/" 2>/dev/null || true
    echo "部署完成: https://gashen0.github.io/labmate/"
fi