# Support Triage & Resolution Playbook

## Overview

**Version**: v0.9-personal-ready
**Support Model**: Community-driven, best-effort
**Scope**: Personal use only (no enterprise support)
**SLA**: None (personal mode)

## Severity Definitions

### S0 - Critical (Service Down)
**Definition**: Complete loss of core functionality affecting all users
**Examples**:
- Application won't start
- Database connection completely broken
- Authentication system failure
- Data corruption or loss

**Response Time**: Best effort same day
**Resolution Target**: 24 hours for hotfix (if within scope)

### S1 - High (Core Feature Broken)
**Definition**: Major feature unusable but service operational
**Examples**:
- EPUB upload fails consistently
- AI chat not responding
- Notes system broken
- Search returning no results

**Response Time**: Within 24 hours
**Resolution Target**: 48-72 hours for fix

### S2 - Medium (Degraded Experience)
**Definition**: Feature partially working or performance issues
**Examples**:
- Slow response times
- Intermittent errors
- UI rendering issues
- Missing documentation

**Response Time**: Within 48 hours
**Resolution Target**: Next maintenance window

### S3 - Low (Minor/Enhancement)
**Definition**: Cosmetic issues or feature requests
**Examples**:
- Typos in UI
- Feature suggestions
- Minor styling issues
- Documentation improvements

**Response Time**: Within 1 week
**Resolution Target**: Quarterly review

## Triage Process

### Step 1: Initial Assessment
```
Is it reproducible?
├─ Yes → Continue to Step 2
└─ No → Request more information
    └─ Template: "Please provide steps to reproduce"
```

### Step 2: Categorization
```
What type of issue?
├─ Bug → Severity assessment
├─ Question → Direct to documentation
├─ Feature Request → Log for review
└─ Security → Immediate escalation
```

### Step 3: Severity Assignment
```
Does it block core functionality?
├─ Yes → Is data at risk?
│   ├─ Yes → S0 Critical
│   └─ No → S1 High
└─ No → Is it a regression?
    ├─ Yes → S2 Medium
    └─ No → S3 Low
```

### Step 4: Response Template
```markdown
Thank you for reporting this issue.

**Severity**: S[0-3]
**Category**: Bug/Question/Feature
**Status**: Investigating/Known Issue/Won't Fix

We'll look into this and update you within [timeframe].

In the meantime, please check:
- [Personal Usage Guide](docs/personal-usage.md)
- [Smoke Check](docs/personal-smoke-check.md)
```

## Issue Classification

### Bug Reports
**Required Information**:
- [ ] FlowReader version (v0.9-personal-ready)
- [ ] Node.js version
- [ ] Operating system
- [ ] Browser (if UI issue)
- [ ] Reproduction steps
- [ ] Error messages/logs

**Triage Actions**:
1. Verify reproduction
2. Check existing issues
3. Assess severity
4. Apply appropriate label
5. Respond with timeline

### Questions
**Common Categories**:
- Setup/Installation
- Configuration
- Usage/How-to
- Troubleshooting

**Triage Actions**:
1. Check if documented
2. Link to relevant docs
3. If undocumented, create doc issue
4. Answer if quick (<5 min)
5. Tag as "question"

### Feature Requests
**Evaluation Criteria**:
- Aligns with personal use scope?
- Doesn't require enterprise features?
- Reasonable complexity?
- Community interest?

**Triage Actions**:
1. Thank contributor
2. Assess scope alignment
3. Label "enhancement"
4. Add to backlog
5. Set expectation (quarterly review)

## Hotfix Criteria (Scope Freeze Alignment)

### Eligible for Hotfix
Per T100 Release Freeze constraints, ONLY:
- **Critical Security Vulnerabilities**: Immediate user risk
- **Data Loss Bugs**: User data corruption/loss
- **Authentication Failures**: Complete access failure

### NOT Eligible (Deferred)
- New features
- Performance optimizations
- UI improvements
- Documentation updates (unless critical)
- Enterprise feature activation

### Hotfix Process
```bash
# 1. Create hotfix branch
git checkout -b hotfix/v0.9.1-issue-xxx

# 2. Make MINIMAL change
# Only fix the specific issue

# 3. Test with smoke check
npm run test:smoke  # if available
# Or manual 8-step verification

# 4. Document in verification/
echo "Hotfix for issue #xxx" > verification/HOTFIX_xxx.md

# 5. Update version if needed
# v0.9-personal-ready → v0.9.1-personal-ready

# 6. Create PR with template
```

## Response Templates

### Bug Acknowledgment
```markdown
Thanks for the bug report! I can confirm this is an issue.

**Severity**: S[1-3]
**Impact**: [Brief description]
**Workaround**: [If available]

I'll work on a fix. In the meantime, [workaround/alternative].
```

### Cannot Reproduce
```markdown
I'm unable to reproduce this issue with the steps provided.

Could you please:
1. Confirm your version: `git describe --tags`
2. Share complete error logs
3. Try with a fresh `.env.local` from `.env.example`
4. Run the smoke check: [link to guide]

This will help me identify the issue.
```

### Out of Scope
```markdown
Thank you for the suggestion!

This feature falls under enterprise/commercial scope, which is currently paused for v0.9-personal-ready.

I've added it to our parked backlog for future consideration when expansion resumes.

For now, possible alternatives:
- [Alternative approach if any]
- [Community workaround if exists]
```

### Duplicate Issue
```markdown
This appears to be a duplicate of #[number].

I'm tracking the issue there. Please subscribe to #[number] for updates.

Closing this one to keep discussions consolidated.
```

### Fixed Issue
```markdown
This issue has been fixed in [commit/version].

To get the fix:
```bash
git pull origin master
npm ci
npm run dev
```

Please confirm the issue is resolved after updating.
```

## Common Issues & Solutions

### 1. Supabase Connection Failed
**Symptoms**: "supabaseUrl is required"
**Solution**:
```bash
# Check .env.local exists and has values
cat .env.local | grep SUPABASE

# Ensure no quotes around values
PUBLIC_SUPABASE_URL=https://xxx.supabase.co  # Correct
PUBLIC_SUPABASE_URL="https://xxx.supabase.co"  # Wrong
```

### 2. OpenAI API Errors
**Symptoms**: Chat not responding, 401/403 errors
**Solution**:
- Verify API key is valid
- Check API credits/billing
- Confirm key has GPT-4 access

### 3. Upload Failures
**Symptoms**: Task stuck in "processing"
**Solution**:
- Check file size (<5MB)
- Verify EPUB format
- Check Supabase storage permissions

### 4. Port Already in Use
**Symptoms**: "Port 5173 is already in use"
**Solution**:
```bash
# Use different port
PORT=5174 npm run dev

# Or kill existing process
lsof -i :5173 | grep LISTEN
kill -9 [PID]
```

### 5. Build Artifacts Issue
**Symptoms**: Git showing many modified files
**Solution**:
```bash
git rm -r --cached apps/web/.svelte-kit
git add .gitignore
git commit -m "Fix: Remove tracked build artifacts"
```

## Escalation Path

### Level 1: Community
- GitHub Issues
- GitHub Discussions
- Community contributors

### Level 2: Maintainer
- Tagged urgent issues
- Security vulnerabilities
- Data loss scenarios

### Level 3: Not Available
- No paid support
- No SLA guarantees
- No dedicated support team

## Weekly Triage Meeting (Self)

### Agenda Template
1. **New Issues Review** (15 min)
   - Count by severity
   - Quick classification
   - Initial responses

2. **In-Progress Review** (10 min)
   - Status updates
   - Blockers
   - Need more info?

3. **Closed Issues** (5 min)
   - Verify fixes
   - Documentation updates needed?

4. **Metrics Review** (5 min)
   - Response time average
   - Resolution rate
   - Common themes

5. **Action Items** (5 min)
   - Priority fixes
   - Documentation gaps
   - Process improvements

## Documentation Cross-References

### Must Link in Responses
- [Personal Usage Guide](../personal-usage.md) - Setup and configuration
- [Smoke Check](../personal-smoke-check.md) - Testing procedures
- [Release Notes](../../RELEASE_NOTES_v0.9_personal_ready.md) - Known issues
- [30-Day Observation](./30_day_observation.md) - Monitoring guide

### Quick Reference URLs
```markdown
Setup: https://github.com/Sheldon-92/flowreader/blob/master/docs/personal-usage.md
Testing: https://github.com/Sheldon-92/flowreader/blob/master/docs/personal-smoke-check.md
Issues: https://github.com/Sheldon-92/flowreader/issues
Discussions: https://github.com/Sheldon-92/flowreader/discussions
```

## Metrics Tracking

### Response Metrics
| Metric | Target | Measure |
|--------|--------|---------|
| First Response | <48h | GitHub timestamp |
| S0 Resolution | <24h | Issue close time |
| S1 Resolution | <72h | Issue close time |
| Answer Rate | >80% | Responded/Total |

### Quality Metrics
| Metric | Target | Measure |
|--------|--------|---------|
| Reopen Rate | <10% | Reopened/Closed |
| Duplicate Rate | <20% | Duplicates/Total |
| Documentation Gap | <5% | Undocumented/Total |

## Automation Helpers

### Label Automation
```yaml
# .github/labels.yml (example)
- name: "S0:critical"
  color: "FF0000"
  description: "Service down"

- name: "S1:high"
  color: "FF6600"

- name: "S2:medium"
  color: "FFAA00"

- name: "S3:low"
  color: "00AA00"

- name: "needs-info"
  color: "AAAAAA"

- name: "duplicate"
  color: "CCCCCC"
```

### Triage Checklist
```markdown
- [ ] Issue has clear title
- [ ] Severity assigned
- [ ] Category labeled
- [ ] First response sent
- [ ] Documentation checked
- [ ] Duplicate search done
- [ ] Milestone set (if applicable)
- [ ] Assignee set (if working)
```

## Privacy & Security

### Never Request
- Passwords or API keys
- Full database dumps
- Production data
- Personal information
- Screenshots with sensitive data

### Always Remind
- Redact API keys in logs
- Use test data for reproduction
- Mask personal information
- Check logs before sharing

### Security Issue Handling
1. Request private disclosure
2. Verify the vulnerability
3. Assess impact
4. Create fix (if in scope)
5. Document in SECURITY.md
6. Credit reporter

---

*Last Updated: 2025-09-19*
*Version: 1.0 for v0.9-personal-ready*
*Support Model: Community/Best-effort*