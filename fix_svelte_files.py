#!/usr/bin/env python3
import re
import glob

files_to_fix = [
    "/Users/sheldonzhao/programs/FlowReader/apps/web/src/routes/notes/search/+page.svelte",
    "/Users/sheldonzhao/programs/FlowReader/apps/web/src/routes/library/+page.svelte",
    "/Users/sheldonzhao/programs/FlowReader/apps/web/src/routes/read/[bookId]/+page.svelte",
    "/Users/sheldonzhao/programs/FlowReader/apps/web/src/routes/read/[bookId]/notes/+page.svelte"
]

for filepath in files_to_fix:
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        # Replace { supabase, session } = data with { session } = data
        content = re.sub(r'\{\s*supabase,\s*session\s*\}\s*=\s*data', '{ session } = data', content)

        # Add import if not already present
        if "import { supabase }" not in content and "$lib/supabase" not in content:
            # Add import after the type import
            content = re.sub(
                r"(import type \{ PageData \} from '.\/\$types';)",
                r"\1\n  import { supabase } from '$lib/supabase';",
                content
            )

        with open(filepath, 'w') as f:
            f.write(content)

        print(f"Fixed: {filepath}")
    except Exception as e:
        print(f"Error fixing {filepath}: {e}")

print("All files fixed!")