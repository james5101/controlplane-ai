"""
Scaffold stub generator (no Claude calls required).

Produces minimal file stubs from the manifest — each file gets a header
comment derived from its `purpose` field. Used when the user selects
"scaffold only" mode. Instant, free, and still follows the planned structure.
"""

from pathlib import PurePosixPath

# Per-extension stub templates.
# {purpose} and {filename} are interpolated.
_TEMPLATES: dict[str, str] = {
    ".tf":          "# {purpose}\n\n# TODO: implement\n",
    ".tfvars":      "# {purpose}\n\n# TODO: fill in values\n",
    ".hcl":         "# {purpose}\n\n# TODO: implement\n",
    ".yml":         "# {purpose}\n\n# TODO: implement\n",
    ".yaml":        "# {purpose}\n\n# TODO: implement\n",
    ".json":        "{}\n",
    ".py":          '"""{purpose}"""\n\n# TODO: implement\n',
    ".ts":          "// {purpose}\n\n// TODO: implement\n",
    ".tsx":         "// {purpose}\n\n// TODO: implement\n",
    ".js":          "// {purpose}\n\n// TODO: implement\n",
    ".jsx":         "// {purpose}\n\n// TODO: implement\n",
    ".go":          "// {purpose}\n\npackage main\n\n// TODO: implement\n",
    ".md":          "# {filename}\n\n{purpose}\n\n<!-- TODO: fill in content -->\n",
    ".sh":          "#!/usr/bin/env bash\n# {purpose}\n\n# TODO: implement\n",
    ".env.example": "# {purpose}\n# TODO: add required environment variables\n",
    ".gitignore":   "# {purpose}\n\n# TODO: add patterns\n",
}

_DEFAULT = "# {purpose}\n\n# TODO: implement\n"


def generate_stubs(manifest: list[dict]) -> dict[str, str]:
    """
    Return {path: stub_content} for every entry in the manifest.
    Takes < 1ms — no I/O, no external calls.
    """
    file_tree: dict[str, str] = {}
    for entry in manifest:
        path: str = entry["path"]
        purpose: str = entry.get("purpose", "")
        filename = PurePosixPath(path).name

        # Match on full filename first (e.g. .gitignore, .env.example),
        # then on extension, then fall back to default.
        suffixes = PurePosixPath(path).suffixes  # e.g. ['.env', '.example']
        ext = "".join(suffixes) if suffixes else ""
        last_ext = suffixes[-1] if suffixes else ""

        template = (
            _TEMPLATES.get(filename)
            or _TEMPLATES.get(ext)
            or _TEMPLATES.get(last_ext)
            or _DEFAULT
        )
        file_tree[path] = template.format(purpose=purpose, filename=filename)

    return file_tree
