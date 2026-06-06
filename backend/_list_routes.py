import sys
sys.path.insert(0, '.')
from apps.sso_service.main import router
for r in router.routes:
    if hasattr(r, 'methods') and r.methods:
        methods = ','.join(sorted(r.methods))
        print(f'{methods:18} {r.path}')
    elif hasattr(r, 'path'):
        print(f'{(chr(45) * 18)} {r.path}')
