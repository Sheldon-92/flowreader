<script>
  let message = 'FlowReader Test Page';
</script>

<div class="p-8">
  <h1 class="text-3xl font-bold mb-4">{message}</h1>
  <p class="text-gray-600">如果您看到这个页面，说明 SvelteKit 基础功能正常。</p>

  <div class="mt-8 p-4 bg-blue-50 rounded">
    <h2 class="font-semibold mb-2">环境检查：</h2>
    <ul class="list-disc list-inside">
      <li>✅ SvelteKit 运行正常</li>
      <li>✅ 路由工作正常</li>
      <li>⚠️ Supabase 认证需要修复</li>
    </ul>
  </div>

  <div class="mt-4">
    <a href="/" class="text-blue-600 hover:underline">返回首页（可能会出错）</a>
  </div>
</div>