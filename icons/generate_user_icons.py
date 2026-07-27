from PIL import Image
import os

out = os.path.dirname(__file__)
img = Image.open(os.path.join(out, 'user-logo.jpg')).convert('RGBA')

# 裁切为正方形（从中心）
width, height = img.size
size = min(width, height)
left = (width - size) // 2
top = (height - size) // 2
img = img.crop((left, top, left + size, top + size))

sizes = {
    'icon-192.png': 192,
    'icon-512.png': 512,
    'apple-touch-icon.png': 180,
    'favicon.png': 64,
}

for name, s in sizes.items():
    resized = img.resize((s, s), Image.LANCZOS)
    resized.save(os.path.join(out, name), 'PNG')
    print(f'Generated {name} ({s}x{s})')

print('Done!')
