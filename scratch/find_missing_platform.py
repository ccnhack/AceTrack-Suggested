import os
import re

def find_missing_platform_imports(directory):
    # This regex looks for Platform.OS or other Platform usages that aren't strings
    # and then checks if Platform is imported from react-native.
    platform_usage_re = re.compile(r'(?<![\'"])\bPlatform\b(?![\'"])')
    import_re = re.compile(r'import\s+\{[^}]*?\bPlatform\b[^}]*?\}\s+from\s+[\'"]react-native[\'"]', re.DOTALL)
    cjs_re = re.compile(r'const\s+\{[^}]*?\bPlatform\b[^}]*?\}\s+=\s+require\([\'"]react-native[\'"]\)')

    for root, dirs, files in os.walk(directory):
        if 'node_modules' in dirs:
            dirs.remove('node_modules')
        if '.git' in dirs:
            dirs.remove('.git')
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if platform_usage_re.search(content):
                            if not (import_re.search(content) or cjs_re.search(content)):
                                print(f"MISSING IMPORT: {path}")
                except:
                    pass

if __name__ == "__main__":
    find_missing_platform_imports('.')
