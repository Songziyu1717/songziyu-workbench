from PIL import Image, ImageDraw, ImageFont
import os

out = os.path.dirname(__file__)

# 生成 512x512 主图标：SVt 应援色钻石
img = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# 背景圆角矩形（玫瑰石英粉渐变模拟）
cx, cy = 256, 256
# 粉色渐变圆形
for r in range(220, 0, -1):
    t = r / 220
    color = (
        int(247 + (255 - 247) * t),
        int(202 + (183 - 202) * t),
        int(201 + (197 - 201) * t),
        255
    )
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

# 绘制钻石形状 (SEVENTEEN 标志性钻石)
# 钻石顶部中心点、右侧点、底部中心点、左侧点
diamond_color = (255, 255, 255, 230)
pts = [
    (256, 140),   # 顶部
    (340, 256),   # 右侧
    (256, 370),   # 底部
    (172, 256),   # 左侧
]
draw.polygon(pts, fill=diamond_color)

# 内部小菱形（宁静蓝）
inner_pts = [
    (256, 190),
    (290, 256),
    (256, 320),
    (222, 256),
]
draw.polygon(inner_pts, fill=(146, 168, 209, 200))

# 顶部闪耀点
draw.ellipse([248, 150, 264, 166], fill=(79, 195, 247, 255))

# 保存各种尺寸
sizes = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'apple-touch-icon.png': 180,
    'favicon.png': 64,
}

for name, size in sizes.items():
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(out, name), 'PNG')
    print(f'Generated {name} ({size}x{size})')

print('Done!')
