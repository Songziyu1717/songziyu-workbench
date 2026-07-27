from PIL import Image
import os

out = os.path.dirname(__file__)
img = Image.open(os.path.join(out, 'user-logo.jpg')).convert('RGBA')

# 放大铺满模式：原图按比例缩放，短边填满画布，居中裁剪
# 这样中间主体更大，系统圆角裁剪会裁掉边角
sizes = {
    'icon-192.png': (192, 192),
    'icon-512.png': (512, 512),
    'apple-touch-icon.png': (180, 180),
    'favicon.png': (64, 64),
}

for name, (target_w, target_h) in sizes.items():
    # 按比例缩放，让短边填满画布
    img_ratio = img.width / img.height
    target_ratio = target_w / target_h

    if img_ratio > target_ratio:
        # 图片更宽，按高度缩放，宽度会超出，需要左右裁剪
        new_h = target_h
        new_w = int(target_h * img_ratio)
    else:
        # 图片更高，按宽度缩放，高度会超出，需要上下裁剪
        new_w = target_w
        new_h = int(target_w / img_ratio)

    resized = img.resize((new_w, new_h), Image.LANCZOS)

    # 居中裁剪到目标尺寸
    x = (new_w - target_w) // 2
    y = (new_h - target_h) // 2
    canvas = resized.crop((x, y, x + target_w, y + target_h))
    canvas.save(os.path.join(out, name), 'PNG')
    print(f'Generated {name} ({target_w}x{target_h})')

print('Done!')
