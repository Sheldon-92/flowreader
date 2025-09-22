-- FlowReader Supabase Storage 配置
-- 在 Supabase Dashboard 的 SQL Editor 中执行这个脚本

-- 1. 创建 books 存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'books',
  'books',
  false,
  52428800, -- 50MB 限制
  ARRAY['application/epub+zip', 'application/pdf']
);

-- 2. 设置 RLS 策略 - 用户只能上传到自己的文件夹
CREATE POLICY "Users can upload their own books"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'books' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- 3. 用户只能查看自己的书籍
CREATE POLICY "Users can view their own books"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'books' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- 4. 用户可以删除自己的书籍
CREATE POLICY "Users can delete their own books"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'books' AND
  auth.uid()::text = (string_to_array(name, '/'))[1]
);

-- 5. 创建一个函数来清理用户数据（可选）
CREATE OR REPLACE FUNCTION clean_user_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- 当用户被删除时，删除他们的所有书籍
  DELETE FROM storage.objects
  WHERE bucket_id = 'books'
  AND (string_to_array(name, '/'))[1] = OLD.id::text;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 6. 创建触发器（可选）
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION clean_user_storage();