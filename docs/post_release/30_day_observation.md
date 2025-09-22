# 30-Day Post-Release Observation Manual

## Overview

**Version**: v0.9-personal-ready
**Release Date**: 2025-09-19
**Observation Period**: 30 days (Until 2025-10-19)
**Mode**: Personal Use / Self-Service Support

## Observation Goals

### Primary Objectives
1. **Stability Monitoring**: Ensure core functionality remains operational
2. **User Feedback Collection**: Gather early adopter experiences
3. **Issue Identification**: Detect patterns requiring hotfix consideration
4. **Usage Patterns**: Understand how personal users interact with features

### Secondary Objectives
- Document common setup challenges
- Identify documentation gaps
- Collect feature requests for future consideration
- Monitor resource consumption patterns

## Observation Schedule

### Daily Checks (5 minutes)
| Time | Task | Tool/Method | Success Criteria |
|------|------|-------------|------------------|
| Morning | Health Check | `curl http://localhost:5173/api/health` | Status "ok" |
| Morning | Error Count | `grep -c ERROR npm-dev.log` or terminal | <5 new errors |
| Evening | GitHub Issues | Check new issues | Triaged within 24h |

### Weekly Checks (30 minutes)
| Day | Task | Details | Threshold |
|-----|------|---------|-----------|
| Monday | Smoke Test | Run 8-step verification | 100% pass |
| Wednesday | Dependency Audit | `npm audit` | No critical |
| Friday | Log Analysis | Review error patterns | No recurring |
| Sunday | Feedback Summary | Consolidate user reports | Document trends |

## Core Observation Metrics

### 1. Health Check Success Rate
```bash
# Sample N times
for i in {1..10}; do
  curl -sf http://localhost:5173/api/health | jq -r '.status'
  sleep 2
done | grep -c "ok" | awk '{print "Success rate: " $1 "/10"}'
```
**Threshold**: >95% success rate
**Action if below**: Check server logs, restart if needed

### 2. Error Log Analysis
```bash
# Count error types (if using file logging)
grep -E "ERROR|FATAL|CRITICAL" *.log | \
  awk -F: '{print $3}' | sort | uniq -c | sort -rn | head -10
```
**Threshold**: <10 unique error types per day
**Action if above**: Investigate top 3 error types

### 3. Response Time Sampling
```bash
# Measure API response times
for endpoint in health upload/signed-url library notes; do
  time curl -sf "http://localhost:5173/api/$endpoint" -o /dev/null
done
```
**Threshold**: <500ms for reads, <2s for writes
**Action if above**: Profile performance bottleneck

### 4. User Feedback Categories
| Category | Count | Priority | Example |
|----------|-------|----------|---------|
| Setup Issues | - | High | "Can't connect to Supabase" |
| Feature Bugs | - | Medium | "Search not finding notes" |
| Enhancement Requests | - | Low | "Want dark mode" |
| Documentation | - | Medium | "Unclear how to..." |

## Daily Observation Log Template

```markdown
## Date: YYYY-MM-DD

### Health Metrics
- [ ] Morning health check: OK / FAIL
- [ ] Evening health check: OK / FAIL
- Response time avg: ___ms
- Error count today: ___
- New GitHub issues: ___

### Notable Events
-

### User Feedback
-

### Actions Taken
-

### Tomorrow's Focus
-
```

## Threshold & Response Matrix

| Metric | Green | Yellow | Red | Response |
|--------|-------|--------|-----|----------|
| Health Check Success | >95% | 80-95% | <80% | Red: Immediate investigation |
| Error Rate (per hour) | <5 | 5-20 | >20 | Yellow: Log review; Red: Debug |
| Response Time (ms) | <200 | 200-1000 | >1000 | Yellow: Monitor; Red: Profile |
| Open Issues | <10 | 10-25 | >25 | Yellow: Triage; Red: Prioritize |
| Disk Usage | <1GB | 1-5GB | >5GB | Yellow: Clean temp; Red: Archive |
| Memory Usage | <500MB | 500MB-1GB | >1GB | Yellow: Monitor; Red: Restart |

## Weekly Report Template

```markdown
## Week of: YYYY-MM-DD to YYYY-MM-DD

### Summary Stats
- Total health checks: ___ (Success rate: __%)
- Total errors logged: ___
- New issues opened: ___
- Issues resolved: ___
- Active users (estimated): ___

### Top Issues This Week
1.
2.
3.

### User Feedback Themes
- Most requested feature:
- Common pain point:
- Documentation gap:

### System Performance
- Average response time: ___ms
- Peak memory usage: ___MB
- Disk growth: ___MB

### Actions for Next Week
- [ ]
- [ ]
- [ ]

### Risk Assessment
- Current risk level: Low / Medium / High
- Primary concern:
- Mitigation plan:
```

## Escalation Triggers

### Immediate Action Required (S0)
- [ ] Complete service outage
- [ ] Data corruption detected
- [ ] Security vulnerability discovered
- [ ] Authentication system failure

**Response**: Stop service, investigate root cause, apply hotfix if within scope

### High Priority (S1)
- [ ] Core feature broken (upload, read, chat)
- [ ] >50% health check failures
- [ ] Critical user data at risk

**Response**: Debug within 4 hours, hotfix within 24 hours if possible

### Medium Priority (S2)
- [ ] Non-core feature issues
- [ ] Performance degradation
- [ ] Documentation confusion

**Response**: Acknowledge within 24 hours, fix in next maintenance window

### Low Priority (S3)
- [ ] Enhancement requests
- [ ] Minor UI issues
- [ ] Feature suggestions

**Response**: Log for quarterly review, thank contributor

## Data Collection Privacy

### What We Track
- Application health metrics
- Error counts and types
- Performance timings
- GitHub issue statistics

### What We DON'T Track
- User personal data
- Reading content
- Chat conversations
- API keys or credentials
- IP addresses
- Usage analytics

### Data Handling
- All metrics stay local
- No telemetry to external services
- Logs rotate weekly
- Sensitive data redacted

## Monthly Summary Template

```markdown
## 30-Day Post-Release Summary
**Version**: v0.9-personal-ready
**Period**: 2025-09-19 to 2025-10-19

### Overall Health
- Service availability: ___%
- Total errors logged: ___
- Critical issues: ___
- User reports: ___

### Key Achievements
1.
2.
3.

### Main Challenges
1.
2.
3.

### User Adoption
- Estimated active users: ___
- GitHub stars gained: ___
- Forks created: ___
- Contributors: ___

### Documentation Improvements
-

### Hotfixes Applied
- None / List

### Recommendations
- [ ] Consider for next release:
- [ ] Documentation updates needed:
- [ ] Process improvements:

### Conclusion
- Stability: Stable / Minor Issues / Needs Attention
- User Satisfaction: High / Medium / Low
- Ready for broader adoption: Yes / No / With conditions
```

## Tools & Resources

### Monitoring Scripts
- `scripts/observe/health_check.sh` - Automated health sampling
- `scripts/observe/collect_logs.sh` - Log aggregation helper

### Documentation Links
- [Personal Usage Guide](../personal-usage.md)
- [Smoke Check Procedure](../personal-smoke-check.md)
- [Support Triage Playbook](./support_triage_playbook.md)
- [GitHub Issues](https://github.com/Sheldon-92/flowreader/issues)

### Quick Commands
```bash
# Health check
curl -sf http://localhost:5173/api/health | jq

# Count today's errors
grep "$(date +%Y-%m-%d)" npm-dev.log | grep -c ERROR

# List recent issues (requires gh cli)
gh issue list --limit 10 --repo Sheldon-92/flowreader

# Check disk usage
du -sh ~/.flowreader 2>/dev/null || echo "No local data"

# Memory usage
ps aux | grep -E "node|npm" | awk '{sum+=$6} END {print sum/1024 " MB"}'
```

## Contact & Support Channels

### Primary
- GitHub Issues: Technical problems and bugs
- GitHub Discussions: Questions and community support

### Emergency
- For data loss or security issues: Create URGENT labeled issue
- For complete outage: Check GitHub status, restart service

## Notes

- This is a personal use release - no SLA commitments
- Best-effort support via GitHub community
- Hotfixes only for critical issues within frozen scope
- Enterprise features remain paused during observation period

---

*Last Updated: 2025-09-19*
*Next Review: 2025-10-19*
*Document Version: 1.0*