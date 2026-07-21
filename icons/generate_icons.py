import os
from PIL import Image, ImageDraw

# Create icons directory
os.makedirs('icons', exist_ok=True)

for size in [16, 48, 128]:
    # Create an RGBA image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    margin = max(1, size // 16)
    
    # Beautiful purple-indigo background (#6366f1 -> RGB 99, 102, 241)
    draw.rounded_rectangle(
        [margin, margin, size - margin - 1, size - margin - 1],
        radius=max(2, size // 4),
        fill=(99, 102, 241, 255)
    )
    
    # Draw a bold white checkmark in the center
    # Checkmark vertices relative to size
    p1 = (size * 0.33, size * 0.5)
    p2 = (size * 0.47, size * 0.64)
    p3 = (size * 0.70, size * 0.36)
    line_width = max(1, size // 10)
    
    # Draw checkmark lines
    draw.line([p1, p2, p3], fill=(255, 255, 255, 255), width=line_width, joint="round")
    
    # Save the PNG
    img.save(f'icons/icon-{size}.png')
    print(f'Created icons/icon-{size}.png ({size}x{size})')
