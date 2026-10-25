"""Validate the distributable structure; this does not grade writing quality."""

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {"plain-chat", "plain-docs", "plain-research", "plain-code", "plain-mail"}


def validate(root=ROOT):
    errors = []
    skills_root = root / "skills"
    actual = {p.name for p in skills_root.iterdir() if p.is_dir()}
    if actual != EXPECTED:
        errors.append(f"Skill directories differ: {sorted(actual)}")
    for name in sorted(EXPECTED):
        entry = skills_root / name / "SKILL.md"
        if not entry.is_file():
            errors.append(f"Missing {entry.relative_to(root)}")
            continue
        content = entry.read_text(encoding="utf-8")
        match = re.match(r"\A---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n", content)
        if not match or match[1] != name or len(match[2]) > 1024:
            errors.append(f"Invalid frontmatter: {name}")
        if "[TODO:" in content:
            errors.append(f"Unfinished scaffold: {name}")
        example = entry.parent / "references" / "examples.md"
        if not example.is_file():
            errors.append(f"Missing self-contained examples: {name}")
    for file in root.rglob("*.md"):
        if any(part in {".git", "node_modules", "dist", ".next", ".vinext", ".wrangler", ".sites-runtime", "work"} for part in file.relative_to(root).parts):
            continue
        content = file.read_text(encoding="utf-8")
        for raw in re.findall(r"\]\(([^\n)]+)\)", content):
            target = raw.strip().strip("<>")
            if urlparse(target).scheme or target.startswith("#"):
                continue
            target = unquote(target.split("#", 1)[0])
            resolved = (file.parent / target).resolve()
            if not resolved.is_relative_to(root.resolve()) or not resolved.exists():
                errors.append(f"Broken/outside link: {file.relative_to(root)} -> {target}")
            if file.is_relative_to(skills_root):
                skill_dir = skills_root / file.relative_to(skills_root).parts[0]
                if not resolved.is_relative_to(skill_dir.resolve()):
                    errors.append(f"Skill depends on outside file: {file.relative_to(root)}")
    cases = json.loads((root / "evals" / "cases.json").read_text(encoding="utf-8"))
    required = {"id", "skill", "prompt", "context", "input", "must_preserve", "must_avoid", "pass_criteria"}
    ids = set()
    covered = set()
    for case in cases:
        if set(case) != required:
            errors.append(f"Invalid case fields: {case.get('id')}")
            continue
        if case["id"] in ids:
            errors.append(f"Duplicate case: {case['id']}")
        ids.add(case["id"])
        covered.add(case["skill"])
        for key in ("must_preserve", "must_avoid"):
            if not isinstance(case[key], list) or not case[key] or not all(isinstance(x, str) and x for x in case[key]):
                errors.append(f"Invalid {key}: {case['id']}")
        for key in ("id", "skill", "prompt", "context", "pass_criteria"):
            if not isinstance(case[key], str) or not case[key].strip():
                errors.append(f"Empty/invalid {key}: {case['id']}")
        if not isinstance(case["input"], str):
            errors.append(f"Invalid input: {case['id']}")
    if covered != EXPECTED:
        errors.append("Evaluation coverage differs from skill set")
    return errors, len(cases)


if __name__ == "__main__":
    problems, count = validate()
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    print(f"PASS: {len(EXPECTED)} skills, local links and {count} evaluation cases. Behavioral quality not evaluated.")
