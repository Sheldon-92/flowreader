---
name: Bug Report
about: Report a bug in FlowReader v0.9-personal-ready
title: '[BUG] '
labels: 'bug, needs-triage'
assignees: ''

---

<!--
Thank you for reporting a bug! Please fill out all required sections.
Before submitting, please check existing issues to avoid duplicates.

PRIVACY REMINDER: Do NOT include:
- API keys or tokens
- Passwords or credentials
- Personal data or real content
- Full database dumps
- Unredacted logs with sensitive info
-->

## Bug Description
<!-- A clear and concise description of what the bug is -->


## Environment (Required)
- **FlowReader Version**: v0.9-personal-ready <!-- Run: git describe --tags -->
- **Node.js Version**: <!-- Run: node --version -->
- **Operating System**: <!-- e.g., macOS 14.0, Ubuntu 22.04, Windows 11 -->
- **Browser** (if UI issue): <!-- e.g., Chrome 120, Firefox 121, Safari 17 -->

## Steps to Reproduce (Required)
<!-- Detailed steps to reproduce the behavior -->
1. Go to '...'
2. Click on '...'
3. Upload file '...'
4. See error

## Expected Behavior
<!-- What you expected to happen -->


## Actual Behavior
<!-- What actually happened -->


## Error Messages/Logs
<!-- If applicable, add error messages or logs. Remember to redact sensitive information! -->
```
[Paste error messages here]
```

## Screenshots
<!-- If applicable, add screenshots to help explain your problem. Ensure no sensitive data is visible! -->


## Additional Context
<!-- Add any other context about the problem here -->

### Checklist Before Submitting
- [ ] I have searched existing issues and this is not a duplicate
- [ ] I have read the [Personal Usage Guide](../../docs/personal-usage.md)
- [ ] I have tried the [Smoke Check](../../docs/personal-smoke-check.md) procedure
- [ ] I have redacted all sensitive information from logs and screenshots
- [ ] I am using the latest version (v0.9-personal-ready)

### Quick Checks
- [ ] `.env.local` is properly configured with all required values
- [ ] Supabase is running and accessible
- [ ] OpenAI API key is valid and has credits
- [ ] No firewall/proxy blocking connections
- [ ] Tried with a fresh browser session/incognito mode

### For Upload Issues
- [ ] File is a valid EPUB format
- [ ] File size is under 5MB
- [ ] Tried with a different EPUB file
- [ ] Checked browser console for errors

### For AI Chat Issues
- [ ] OpenAI API key has GPT-4 access
- [ ] API rate limits not exceeded
- [ ] Network connection is stable

### Severity Assessment (Maintainer Use)
<!-- Leave blank - will be assigned during triage -->
- [ ] S0: Critical - Service completely down
- [ ] S1: High - Core feature broken
- [ ] S2: Medium - Degraded experience
- [ ] S3: Low - Minor issue

---
<!--
Thank you for taking the time to report this issue!
We'll review and respond according to our Support Triage Playbook.
For urgent issues, please add the "urgent" label.
-->