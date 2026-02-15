# PRD — Vel'Afrika

Status: Draft

# Product Requirements Document: Vel'Afrika

Generated from the strategic decision document and executive review feedback.

# 1. Goals

- Strategic objective: Revenue Growth.
- North-star KPI: APGA (African Products Going Abroad). Baseline 17000 -> Target 20400.
- Planning horizon: < 3 months.
- Increase APGA (African Products Going Abroad) by 20% next quarter by improving customer conversion and basket size.
- APGA (primary)
- Conversion rate (logged-in users)
- Items per purchase

# 2. Background

- Vel’Afrika has stable monthly user volume (~11,500 buyers) while sales grow 3% monthly.
- The strategic opportunity is not traffic growth but increasing conversion and items per purchase — especially on mobile (60% of traffic) and high-intent product categories
- Decision type: Incremental Optimization.

# 3. Research

- Vel’Afrika receives significant traffic and product interest but converts a relatively fixed number of customers each month, limiting APGA growth.
- Friction in mobile shopping and checkout experience
- Limited merchandising around high-demand categories (beads)
- Lack of bundle or recommendation mechanisms increasing order size
- Mobile users (60% of visits)
- Option A — Mobile Checkout Optimization
- Option B — Product Bundles & Recommendations
- Option C — Logistics-based Delivery UX

# 4. User Stories

- As a mobile buyer, I want a fast and predictable checkout so I can complete purchases with low friction.
- As a returning buyer, I want relevant bundles and recommendations so I can discover complementary products quickly.
- As an international buyer, I want transparent fulfillment and delivery options so I can purchase with confidence.

# 5. Requirements

- Implement a phased rollout combining Option A (Mobile Checkout Optimization) + Option B (Bundles & Recommendations).
- Trade-off guardrail: Prioritize faster, lower-risk improvements over deep logistics optimization.
- Trade-off guardrail: Focus on buyer-side optimization before supply-side complexity.
- Conduct a downside model to assess potential negative impacts of the decision.
- Complete a compliance review to ensure all regulatory requirements are met.
- Conduct a downside analysis to understand potential financial impacts under adverse scenarios.
- Ensure thorough A/B testing for mobile UX changes to mitigate risks of conversion drops.
- Establish a clear communication plan for phased rollouts to manage user expectations.

# 6. Telemetry

- Primary metric: APGA (African Products Going Abroad).
- Mobile checkout completion rate
- Items per order
- Add-to-cart rate
- Recommendation click-through
- Weekly experimentation review + monthly strategy checkpoint.
- Wakanda Team Product Manager (Facundo Rodriguez)

# 7. UX/UI Design

- Prioritize a simplified mobile checkout path with fewer steps and clear progress feedback.
- Design recommendation and bundle surfaces on PDP/cart with clear relevance cues and opt-out controls.
- Ensure accessible interaction patterns (contrast, focus order, keyboard support, readable touch targets).
- Validate responsive behavior across core mobile breakpoints before rollout.

# 8. Experiment

- Hypothesis: improving checkout and merchandising will increase APGA (African Products Going Abroad).
- Initial probability of success estimate: 60%.
- Experiment horizon: < 3 months.
- APGA increase < 5% after 8 weeks
- Checkout conversion drops by >5%
- Recommendation CTR < baseline navigation CTR
- Engineering delivery slips >30% timeline

# 9. Q&A

- Open blocker: Downside Modeled is false
- Open blocker: Compliance Reviewed is false
- Required revision: Conduct a downside model to assess potential negative impacts of the decision.
- Required revision: Complete a compliance review to ensure all regulatory requirements are met.
- Required revision: Enhance risk matrix with detailed mitigation strategies.

# 10. Notes

- Investment required: 120000.
- 12-month gross benefit estimate: 1071000.
- Chairperson recommendation snapshot: Blocked.