# growthmap playbook brief: plausible.io

App: plausible.io (https://plausible.io/). Run date: 2026-10-30.

## Your instruction

Write the playbook for plausible.io from the evidence a growthmap run fetched on 2026-10-30.
A play is a move this app made, written so the reader can copy it for their own app.

Work only from the Seen records below. Do not add a fact, a link, a name, a count or a
date that is not in one of them. Do not search the web and do not use anything you
already know. If the evidence does not support a play, leave that play out; fewer true
plays are better than one invented.

Every play names what it costs, the first result the reader should expect to see if it
works, and a ready prompt the reader can hand to their own agent. Order the plays by
what is worth doing first.

## What to write

Write exactly one file named plays.json next to this brief, and nothing else.

## The exact shape to return

```json
{
  "plays": [
    {
      "title": "one line naming the play",
      "effort": "what it costs and who does it, in plain words",
      "first_result": "the first thing the reader should see if it works",
      "prompt": "a ready prompt, in the imperative, to hand to the reader's own agent",
      "cites": ["s1", "s3"]
    }
  ]
}
```

- `title`: one line, the move itself, not the outcome it chases.
- `effort`: hours or days and who does it. Never a bare number.
- `first_result`: the first visible sign the play worked. Something checkable.
- `prompt`: the words the reader pastes into their agent to start the play.
- `cites`: the Seen ids from this run that the play rests on.

## The rule that decides whether your answer is accepted

Every play must cite at least one Seen id from this run, and every id it cites must be
one of the Seen ids printed below. growthmap refuses the whole file if a play cites an
id that is not below, or cites none at all. It also refuses a play that is missing its
title, its effort, its first result or its prompt, and it refuses a file that is not
JSON or holds no plays. Write it in the shape above and it is accepted.

## The Seen records from this run

### s1

claim: Homepage describes itself as: "Plausible is a lightweight and open-source Google Analytics alternative. Your website data is 100% yours and the privacy of your visitors is respected".
url: https://plausible.io/
quote: Plausible is a lightweight and open-source Google Analytics alternative. Your website data is 100% yours and the privacy of your visitors is respected.

### s2

claim: About page describes itself as: "Plausible Analytics is an independent, open source web analytics company. We’re a small, self-funded team building a privacy-friendly alternative to Google Analytics".
url: https://plausible.io/about
quote: Plausible Analytics is an independent, open source web analytics company. We’re a small, self-funded team building a privacy-friendly alternative to Google Analytics.

### s3

claim: Features page describes itself as: "Explore what you can do with Plausible Analytics and discover features built to answer real questions about your website traffic".
url: https://plausible.io/features
quote: Explore what you can do with Plausible Analytics and discover features built to answer real questions about your website traffic.

### s4

claim: Homepage first seen in the archive on 2019-07-22.
url: https://web.archive.org/web/20190722082333/https://plausible.io/
quote: 20190722082333 200 https://plausible.io/

### s5

claim: About page first seen in the archive on 2020-07-24.
url: https://web.archive.org/web/20200724052404/https://plausible.io/about
quote: 20200724052404 200 https://plausible.io/about

### s6

claim: Features page first seen in the archive on 2026-08-21.
url: https://web.archive.org/web/20260821222634/https://plausible.io/features
quote: 20260821222634 200 https://plausible.io/features

### s7

claim: Page /ad-cost-calculator first seen in the archive on 2026-05-08.
url: https://web.archive.org/web/20260508115102/https://plausible.io/ad-cost-calculator
quote: 20260508115102 200 https://plausible.io/ad-cost-calculator

### s8

claim: Page /google-analytics-script-size first seen in the archive on 2026-05-03.
url: https://web.archive.org/web/20260503204612/https://plausible.io/google-analytics-script-size
quote: 20260503204612 200 https://plausible.io/google-analytics-script-size

### s9

claim: Page /vs-cloudflare-web-analytics first seen in the archive on 2021-01-26.
url: https://web.archive.org/web/20210126104912/https://plausible.io/vs-cloudflare-web-analytics
quote: 20210126104912 200 https://plausible.io/vs-cloudflare-web-analytics

### s10

claim: Page /compliance first seen in the archive on 2026-06-02.
url: https://web.archive.org/web/20260602194840/https://plausible.io/compliance
quote: 20260602194840 200 https://plausible.io/compliance

### s11

claim: Page /conversion-rate-calculator first seen in the archive on 2026-04-29.
url: https://web.archive.org/web/20260429113004/https://plausible.io/conversion-rate-calculator
quote: 20260429113004 200 https://plausible.io/conversion-rate-calculator

### s12

claim: Page /cookie-banner-traffic-loss-calculator first seen in the archive on 2026-05-04.
url: https://web.archive.org/web/20260504101836/https://plausible.io/cookie-banner-traffic-loss-calculator
quote: 20260504101836 200 https://plausible.io/cookie-banner-traffic-loss-calculator

### s13

claim: Page /cookieless-web-analytics first seen in the archive on 2026-06-02.
url: https://web.archive.org/web/20260602195029/https://plausible.io/cookieless-web-analytics
quote: 20260602195029 200 https://plausible.io/cookieless-web-analytics

### s14

claim: Page /data-policy first seen in the archive on 2019-07-22.
url: https://web.archive.org/web/20190722080758/https://plausible.io/data-policy
quote: 20190722080758 200 https://plausible.io/data-policy

### s15

claim: Page /eu-hosted-web-analytics first seen in the archive on 2026-04-03.
url: https://web.archive.org/web/20260403111333/https://plausible.io/eu-hosted-web-analytics
quote: 20260403111333 200 https://plausible.io/eu-hosted-web-analytics

### s16

claim: Page /google-search-console first seen in the archive on 2026-10-14.
url: https://web.archive.org/web/20261014232820/https://plausible.io/google-search-console
quote: 20261014232820 200 https://plausible.io/google-search-console

### s17

claim: Page /vs-google-analytics first seen in the archive on 2020-04-11.
url: https://web.archive.org/web/20200411120409/https://plausible.io/vs-google-analytics
quote: 20200411120409 200 https://plausible.io/vs-google-analytics

### s18

claim: Page /privacy-friendly-web-analytics first seen in the archive on 2026-06-10.
url: https://web.archive.org/web/20260610175748/https://plausible.io/privacy-friendly-web-analytics
quote: 20260610175748 200 https://plausible.io/privacy-friendly-web-analytics

### s19

claim: Page /white-label-web-analytics first seen in the archive on 2023-06-10.
url: https://web.archive.org/web/20230610214731/https://plausible.io/white-label-web-analytics
quote: 20230610214731 200 https://plausible.io/white-label-web-analytics

### s20

claim: Page /gtm-template first seen in the archive on 2025-09-07.
url: https://web.archive.org/web/20250907153045/https://plausible.io/gtm-template
quote: 20250907153045 200 https://plausible.io/gtm-template

### s21

claim: Page /lightweight-web-analytics first seen in the archive on 2020-04-11.
url: https://web.archive.org/web/20200411123535/https://plausible.io/lightweight-web-analytics
quote: 20200411123535 200 https://plausible.io/lightweight-web-analytics

### s22

claim: Page /migrate-from-google-analytics first seen in the archive on 2026-06-02.
url: https://web.archive.org/web/20260602194840/https://plausible.io/migrate-from-google-analytics
quote: 20260602194840 200 https://plausible.io/migrate-from-google-analytics

### s23

claim: Page /open-source-website-analytics first seen in the archive on 2020-04-11.
url: https://web.archive.org/web/20200411115619/https://plausible.io/open-source-website-analytics
quote: 20200411115619 200 https://plausible.io/open-source-website-analytics

### s24

claim: Page /looker-studio-connector first seen in the archive on 2026-05-03.
url: https://web.archive.org/web/20260503204612/https://plausible.io/looker-studio-connector
quote: 20260503204612 200 https://plausible.io/looker-studio-connector

### s25

claim: Page /wordpress-analytics-plugin first seen in the archive on 2021-02-26.
url: https://web.archive.org/web/20210226152256/https://plausible.io/wordpress-analytics-plugin
quote: 20210226152256 200 https://plausible.io/wordpress-analytics-plugin

### s26

claim: Page /privacy-focused-web-analytics first seen in the archive on 2020-09-26.
url: https://web.archive.org/web/20200926022435/https://plausible.io/privacy-focused-web-analytics
quote: 20200926022435 200 https://plausible.io/privacy-focused-web-analytics

### s27

claim: Page /self-hosted-web-analytics first seen in the archive on 2020-10-06.
url: https://web.archive.org/web/20201006095525/https://plausible.io/self-hosted-web-analytics
quote: 20201006095525 200 https://plausible.io/self-hosted-web-analytics

### s28

claim: Page /most-accurate-web-analytics first seen in the archive on 2024-10-28.
url: https://web.archive.org/web/20241028125222/https://plausible.io/most-accurate-web-analytics
quote: 20241028125222 200 https://plausible.io/most-accurate-web-analytics

### s29

claim: Page /for-public-sector first seen in the archive on 2026-09-04.
url: https://web.archive.org/web/20260904063414/https://plausible.io/for-public-sector
quote: 20260904063414 200 https://plausible.io/for-public-sector

### s30

claim: Page /procurement first seen in the archive on 2026-09-20.
url: https://web.archive.org/web/20260920204214/https://plausible.io/procurement
quote: 20260920204214 200 https://plausible.io/procurement

### s31

claim: Page /real-time-web-analytics first seen in the archive on 2026-08-02.
url: https://web.archive.org/web/20260802181541/https://plausible.io/real-time-web-analytics
quote: 20260802181541 200 https://plausible.io/real-time-web-analytics

### s32

claim: Page /enterprise-web-analytics first seen in the archive on 2026-01-11.
url: https://web.archive.org/web/20260111140842/https://plausible.io/enterprise-web-analytics
quote: 20260111140842 200 https://plausible.io/enterprise-web-analytics

### s33

claim: Page /for-ecommerce first seen in the archive on 2026-05-21.
url: https://web.archive.org/web/20260521140434/https://plausible.io/for-ecommerce
quote: 20260521140434 200 https://plausible.io/for-ecommerce

### s34

claim: Page /for-saas first seen in the archive on 2026-06-02.
url: https://web.archive.org/web/20260602194840/https://plausible.io/for-saas
quote: 20260602194840 200 https://plausible.io/for-saas

### s35

claim: Page /simple-web-analytics first seen in the archive on 2020-04-11.
url: https://web.archive.org/web/20200411114057/https://plausible.io/simple-web-analytics
quote: 20200411114057 200 https://plausible.io/simple-web-analytics

### s36

claim: Page /tools first seen in the archive on 2026-05-08.
url: https://web.archive.org/web/20260508084722/https://plausible.io/tools
quote: 20260508084722 200 https://plausible.io/tools

### s37

claim: Page /track-ai-traffic first seen in the archive on 2026-09-20.
url: https://web.archive.org/web/20260920204220/https://plausible.io/track-ai-traffic
quote: 20260920204220 200 https://plausible.io/track-ai-traffic

### s38

claim: Page /utm-builder first seen in the archive on 2026-04-23.
url: https://web.archive.org/web/20260423085036/https://plausible.io/utm-builder
quote: 20260423085036 200 https://plausible.io/utm-builder

### s39

claim: Page /utm-checker first seen in the archive on 2026-04-27.
url: https://web.archive.org/web/20260427101826/https://plausible.io/utm-checker
quote: 20260427101826 200 https://plausible.io/utm-checker

### s40

claim: Page /vs-matomo first seen in the archive on 2020-04-11.
url: https://web.archive.org/web/20200411112811/https://plausible.io/vs-matomo
quote: 20200411112811 200 https://plausible.io/vs-matomo

### s41

claim: Page /for-bloggers-creators first seen in the archive on 2020-07-17.
url: https://web.archive.org/web/20200717214853/https://plausible.io/for-bloggers-creators
quote: 20200717214853 200 https://plausible.io/for-bloggers-creators

### s42

claim: Page /for-freelancers-agencies first seen in the archive on 2020-07-18.
url: https://web.archive.org/web/20200718171853/https://plausible.io/for-freelancers-agencies
quote: 20200718171853 200 https://plausible.io/for-freelancers-agencies

### s43

claim: Page /audience-segmentation first seen in the archive on 2024-09-05.
url: https://web.archive.org/web/20240905173429/https://plausible.io/audience-segmentation
quote: 20240905173429 200 https://plausible.io/audience-segmentation

### s44

claim: Page /when-not-to-use-plausible first seen in the archive on 2026-06-10.
url: https://web.archive.org/web/20260610190309/https://plausible.io/when-not-to-use-plausible
quote: 20260610190309 200 https://plausible.io/when-not-to-use-plausible

### s45

claim: Hacker News story "Tech-savvy audiences block Google Analytics" (1214 points, 681 comments) dated 2021-08-31.
url: https://news.ycombinator.com/item?id=28365163
quote: {"title":"Tech-savvy audiences block Google Analytics","points":1214,"comments":681,"date":"2021-08-31"}

### s46

claim: Hacker News story "You probably don't need a single-page app" (816 points, 499 comments) dated 2019-02-17.
url: https://news.ycombinator.com/item?id=19184496
quote: {"title":"You probably don't need a single-page app","points":816,"comments":499,"date":"2019-02-17"}

### s47

claim: Hacker News story "AMP pages no longer get preferential treatment in Google search" (719 points, 172 comments) dated 2021-05-18.
url: https://news.ycombinator.com/item?id=27192685
quote: {"title":"AMP pages no longer get preferential treatment in Google search","points":719,"comments":172,"date":"2021-05-18"}

### s48

claim: Hacker News story "How We built a $1M ARR open source SaaS" (522 points, 106 comments) dated 2022-06-24.
url: https://news.ycombinator.com/item?id=31857069
quote: {"title":"How We built a $1M ARR open source SaaS","points":522,"comments":106,"date":"2022-06-24"}

### s49

claim: Hacker News story "Millions are visiting the European Alternatives site. What trends are we seeing?" (493 points, 612 comments) dated 2025-03-24.
url: https://news.ycombinator.com/item?id=43458509
quote: {"title":"Millions are visiting the European Alternatives site. What trends are we seeing?","points":493,"comments":612,"date":"2025-03-24"}

### s50

claim: Hacker News story "An alternative to using Google Analytics on your website" (462 points, 301 comments) dated 2020-04-08.
url: https://news.ycombinator.com/item?id=22813168
quote: {"title":"An alternative to using Google Analytics on your website","points":462,"comments":301,"date":"2020-04-08"}

### s51

claim: Hacker News story "Show HN: Plausible – Self-Hosted Google Analytics alternative" (351 points, 139 comments) dated 2020-10-06.
url: https://news.ycombinator.com/item?id=24696145
quote: {"title":"Show HN: Plausible – Self-Hosted Google Analytics alternative","points":351,"comments":139,"date":"2020-10-06"}

### s52

claim: Hacker News story "How to pay your rent with your open source project" (342 points, 168 comments) dated 2020-07-27.
url: https://news.ycombinator.com/item?id=23963202
quote: {"title":"How to pay your rent with your open source project","points":342,"comments":168,"date":"2020-07-27"}

### s53

claim: Hacker News story "How to pay your rent with your open source project (2020)" (321 points, 290 comments) dated 2022-08-24.
url: https://news.ycombinator.com/item?id=32577513
quote: {"title":"How to pay your rent with your open source project (2020)","points":321,"comments":290,"date":"2022-08-24"}

### s54

claim: Hacker News story "Why we’re changing to the AGPL license" (286 points, 254 comments) dated 2020-10-13.
url: https://news.ycombinator.com/item?id=24763734
quote: {"title":"Why we’re changing to the AGPL license","points":286,"comments":254,"date":"2020-10-13"}

### s55

claim: Hacker News story "We bootstrapped our open source Google Analytics alternative to $500k ARR" (206 points, 68 comments) dated 2021-11-05.
url: https://news.ycombinator.com/item?id=29121589
quote: {"title":"We bootstrapped our open source Google Analytics alternative to $500k ARR","points":206,"comments":68,"date":"2021-11-05"}

### s56

claim: Hacker News story "Lessons from building and growing an open source SaaS" (173 points, 41 comments) dated 2020-12-17.
url: https://news.ycombinator.com/item?id=25454837
quote: {"title":"Lessons from building and growing an open source SaaS","points":173,"comments":41,"date":"2020-12-17"}

### s57

claim: Hacker News story "How to fight back against Google FLoC" (158 points, 90 comments) dated 2021-04-16.
url: https://news.ycombinator.com/item?id=26829845
quote: {"title":"How to fight back against Google FLoC","points":158,"comments":90,"date":"2021-04-16"}

### s58

claim: Hacker News story "Plausible Analytics: GDPR Compliance w/o Cookie Consent Banner" (145 points, 137 comments) dated 2024-07-08.
url: https://news.ycombinator.com/item?id=40909006
quote: {"title":"Plausible Analytics: GDPR Compliance w/o Cookie Consent Banner","points":145,"comments":137,"date":"2024-07-08"}

### s59

claim: Hacker News story "Plausible Community Edition" (125 points, 103 comments) dated 2024-07-10.
url: https://news.ycombinator.com/item?id=40925266
quote: {"title":"Plausible Community Edition","points":125,"comments":103,"date":"2024-07-10"}

### s60

claim: Hacker News story "You probably don't need a single page app" (31 points, 24 comments) dated 2019-07-08.
url: https://news.ycombinator.com/item?id=20384738
quote: {"title":"You probably don't need a single page app","points":31,"comments":24,"date":"2019-07-08"}

### s61

claim: Hacker News story "Simplifying our homepage helped increase trial signups by 84%" (15 points, 0 comments) dated 2026-05-13.
url: https://news.ycombinator.com/item?id=48123379
quote: {"title":"Simplifying our homepage helped increase trial signups by 84%","points":15,"comments":0,"date":"2026-05-13"}

### s62

claim: Hacker News story "Every number in Google Analytics is wrong" (10 points, 10 comments) dated 2024-10-28.
url: https://news.ycombinator.com/item?id=41968619
quote: {"title":"Every number in Google Analytics is wrong","points":10,"comments":10,"date":"2024-10-28"}

### s63

claim: Hacker News story "Google Analytics counts bots as real traffic [New Test]" (8 points, 0 comments) dated 2025-05-27.
url: https://news.ycombinator.com/item?id=44105645
quote: {"title":"Google Analytics counts bots as real traffic [New Test]","points":8,"comments":0,"date":"2025-05-27"}

### s64

claim: Hacker News story "Plausible: Self-Hosted Google Analytics Alternative" (6 points, 0 comments) dated 2022-04-11.
url: https://news.ycombinator.com/item?id=30994931
quote: {"title":"Plausible: Self-Hosted Google Analytics Alternative","points":6,"comments":0,"date":"2022-04-11"}

### s65

claim: YouTube video "Google Analytics vs Plausible Analytics Comparison 2025 | Best Web Analytics Tools" by Jake's Tech Lab (1,800 views).
url: https://www.youtube.com/watch?v=sXfLthhqqKY
quote: {"title":"Google Analytics vs Plausible Analytics Comparison 2025 | Best Web Analytics Tools","channel":"Jake's Tech Lab","url":"https://www.youtube.com/watch?v=sXfLthhqqKY","views":1800}

### s66

claim: YouTube video "Deep dive into Plausible analytics, a Google Analytics competitor" by A Better Computer (9,427 views).
url: https://www.youtube.com/watch?v=nImTI8u5JLk
quote: {"title":"Deep dive into Plausible analytics, a Google Analytics competitor","channel":"A Better Computer","url":"https://www.youtube.com/watch?v=nImTI8u5JLk","views":9427}

### s67

claim: YouTube video "Why Your Plausible and Google Analytics Numbers Don't Match (The Real Reason)" by Analytics Playbook: Learn Marketing Analytics (621 views).
url: https://www.youtube.com/watch?v=sMIeWzIbL9g
quote: {"title":"Why Your Plausible and Google Analytics Numbers Don't Match (The Real Reason)","channel":"Analytics Playbook: Learn Marketing Analytics","url":"https://www.youtube.com/watch?v=sMIeWzIbL9g","views":621}

### s68

claim: YouTube video "Is Plausible a Good Alternative to Google Analytics 4?" by Cookieless Tech (2,042 views).
url: https://www.youtube.com/watch?v=gk1dqL4vRj0
quote: {"title":"Is Plausible a Good Alternative to Google Analytics 4?","channel":"Cookieless Tech","url":"https://www.youtube.com/watch?v=gk1dqL4vRj0","views":2042}

### s69

claim: YouTube video "DITCH Google Analytics. Use Plausible on your website!" by TechHut (13,243 views).
url: https://www.youtube.com/watch?v=P0T6VjTS7_Y
quote: {"title":"DITCH Google Analytics. Use Plausible on your website!","channel":"TechHut","url":"https://www.youtube.com/watch?v=P0T6VjTS7_Y","views":13243}

### s70

claim: YouTube video "Plausible Analytics vs Looker Studio Comparison 2025 | Best Analytics Platform Review" by Jake's Tech Lab (559 views).
url: https://www.youtube.com/watch?v=cn9zp0wBsZE
quote: {"title":"Plausible Analytics vs Looker Studio Comparison 2025 | Best Analytics Platform Review","channel":"Jake's Tech Lab","url":"https://www.youtube.com/watch?v=cn9zp0wBsZE","views":559}

### s71

claim: YouTube video "How to Self host Plausible on Coolify" by DIY Software (1,590 views).
url: https://www.youtube.com/watch?v=b6OT03f_aBQ
quote: {"title":"How to Self host Plausible on Coolify","channel":"DIY Software","url":"https://www.youtube.com/watch?v=b6OT03f_aBQ","views":1590}

### s72

claim: YouTube video "Umami vs Google Analytics vs Plausible: The Ultimate Web Analytics Comparison" by Aliaksandr Tsykin (4,361 views).
url: https://www.youtube.com/watch?v=8xBC_Vp2e7c
quote: {"title":"Umami vs Google Analytics vs Plausible: The Ultimate Web Analytics Comparison","channel":"Aliaksandr Tsykin","url":"https://www.youtube.com/watch?v=8xBC_Vp2e7c","views":4361}

### s73

claim: YouTube video "What is the meaning of Plausible?" by Words Unlocked (613 views).
url: https://www.youtube.com/watch?v=Vm4z2a_70-o
quote: {"title":"What is the meaning of Plausible?","channel":"Words Unlocked","url":"https://www.youtube.com/watch?v=Vm4z2a_70-o","views":613}

### s74

claim: YouTube video "Google Analytics consultant tries Plausible!" by Leon Korteweg (1,777 views).
url: https://www.youtube.com/watch?v=JCaPnqgQPYA
quote: {"title":"Google Analytics consultant tries Plausible!","channel":"Leon Korteweg","url":"https://www.youtube.com/watch?v=JCaPnqgQPYA","views":1777}
