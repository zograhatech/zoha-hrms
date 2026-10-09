
import os

path = r'e:\MS project\MERN\HRMS2\HRMS\frontend\src\index.css'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# Remove trailing whitespace and then check for double braces
trimmed = text.rstrip()
if trimmed.endswith('}\n}'):
    new_text = trimmed[:-2] + '\n'
elif trimmed.endswith('}}'):
    new_text = trimmed[:-1] + '\n'
else:
    # If it ends with } } or similar
    import re
    new_text = re.sub(r'}\s*}\s*$', '}\n', text)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_text)

print("Attempted to fix extra brace")
