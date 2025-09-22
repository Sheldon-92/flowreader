#!/bin/bash

# FlowReader 云部署脚本
# 使用前请确保已安装 Vercel CLI: npm i -g vercel

echo "🚀 FlowReader 云部署脚本"
echo "========================="

# 检查是否在正确的目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在 apps/web 目录中运行此脚本"
    exit 1
fi

# 检查 Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI 未安装"
    echo "📦 正在安装 Vercel CLI..."
    npm i -g vercel
fi

# 构建项目
echo "🔨 构建项目..."
npm run build 2>&1 | tee build.log

# Check if .svelte-kit/output directory exists (successful build)
if [ -d ".svelte-kit/output" ]; then
    echo "✅ 构建成功!"
else
    echo "❌ 构建失败，请检查错误"
    exit 1
fi

# 部署到 Vercel
echo ""
echo "📤 部署到 Vercel..."
echo "请按提示操作："
echo "1. 选择或创建 Vercel 项目"
echo "2. 确认项目设置"
echo "3. 等待部署完成"
echo ""

vercel --prod

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 部署成功！"
    echo ""
    echo "📋 下一步："
    echo "1. 在 Supabase Dashboard 执行 supabase_storage_setup.sql"
    echo "2. 在 Vercel Dashboard 设置环境变量"
    echo "3. 更新 Supabase 的重定向 URL"
    echo ""
    echo "详细说明请查看 DEPLOYMENT_GUIDE.md"
else
    echo "❌ 部署失败，请检查错误"
    exit 1
fi