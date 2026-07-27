from PIL import Image
import os

out = os.path.dirname(__file__)
img = Image.open(os.path.join(out, 'user-logo.jpg')).convert('RGBA')

# 保持原图比例，缩放适应目标尺寸，不裁切、不加背景
# 目标尺寸按宽度缩放，高度自适应（保持原图完整）
sizes = {
    'icon-192.png': (192, 192),
    'icon-512.png': (512, 512),
    'apple-touch-icon.png': (180, 180),
    'favicon.png': (64, 64),
}

for name, (target_w, target_h) in sizes.items():
    # 按比例缩放到能完整放入目标框的最大尺寸
    img_ratio = img.width / img.height
    target_ratio = target_w / target_h

    if img_ratio > target_ratio:
        # 图片更宽，按宽度缩放
        new_w = target_w
        new_h = int(target_w / img_ratio)
    else:
        # 图片更高，按高度缩放
        new_h = target_h
        new_w = int(target_h * img_ratio)

    resized = img.resize((new_w, new_h), Image.LANCZOS)

    # 创建透明背景画布，居中放置
    canvas = Image.new('RGBA', (target_w, target_h), (255, 255, 255, 0))
    x = (target_w - new_w) // 2
    y = (target_h - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    canvas.save(os.path.join(out, name), 'PNG')
    print(f'Generated {name} ({target_w}x{target_h})')

print('Done!')
