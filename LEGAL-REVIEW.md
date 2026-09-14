# Brief for legal review — Voltix

Prepared for an advocate reviewing this site before it takes real traffic.
Written by the developer; **nothing here is legal advice**. Sections 1–4 are
factual descriptions of what the software does, so counsel does not have to
reverse-engineer it. Section 5 is what we need answered.

Live site: <https://voltix-khaki.vercel.app>
Terms: <https://voltix-khaki.vercel.app/terms>
Privacy: <https://voltix-khaki.vercel.app/privacy>

---

## 1. What the business is

Voltix is a website that directs people to **Deriv**, a derivatives broker, and
earns commission when they open an account and trade. It is an affiliate
arrangement under Deriv's partner programme.

The operator is **not** a broker. It does not hold client money, does not act
as counterparty to any trade, and does not give advice. Every account, balance
and trade sits with Deriv under Deriv's own terms.

The instruments are **synthetic indices** — simulated markets priced by Deriv,
not tied to real-world assets. Users buy short-duration contracts predicting
whether the price rises or falls. A losing contract loses the entire stake.

Expected audience: Kenya and East Africa.

---

## 2. What the site does technically

1. A visitor lands on the marketing page and sees live prices.
2. They click "Login with Deriv" and are sent to Deriv's own login, carrying an
   affiliate token that credits the operator for the signup.
3. They authenticate **with Deriv**, not with us. We never see their password.
4. They return to our dashboard, where they can place trades on their own Deriv
   account through Deriv's API.

The site can therefore be used to **place real-money trades**, not only to
refer. That distinction may matter to the questions below.

Safeguards already built in: demo accounts are selected by default, real-money
accounts show a persistent warning banner, and real-money trades require an
explicit confirmation stating the cost, potential payout, and worst-case loss.

---

## 3. What personal data is handled

We operate **no database of users**. Specifically:

- No user accounts, names, emails or documents are stored by us.
- The Deriv access token is held in a cookie on the visitor's own browser,
  marked `httpOnly`, and relayed only to Deriv.
- We never receive or store the visitor's Deriv password.
- Identity verification, funds and trading history are all held by Deriv.
- Our host (Vercel) keeps standard request logs: IP address, timestamp, user
  agent.
- We set no advertising or analytics cookies.

An affiliate identifier is passed to Deriv at signup so the referral is
attributed to us.

---

## 4. What is already displayed

- A **risk warning** on the landing page and on the trading dashboard, stating
  that the products carry high risk, that the entire stake can be lost, and
  that they are not suitable for everyone.
- An **affiliate disclosure** in the footer of every page, stating that we are
  not a broker, do not hold funds, and receive commission.
- **Terms of Use** and a **Privacy Policy**, both currently marked in-page as
  unreviewed templates.

We would like to remove those "unreviewed" notices once counsel has approved
the content.

---

## 5. Questions for counsel

1. **Licensing.** Does operating this site — referring Kenyan residents to a
   derivatives broker for commission, and providing an interface through which
   they place trades — require authorisation from the **Capital Markets
   Authority**, or fall within its online forex broker regulations? Does the
   answer change because the site can place trades, rather than only refer?

2. **Financial promotion.** Is the risk warning adequate in wording and
   prominence for a financial promotion directed at Kenyan consumers? Are there
   required forms of words we are missing?

3. **Affiliate disclosure.** Does the disclosure meet local requirements for
   disclosing a commercial interest?

4. **Data protection.** Does the Privacy Policy satisfy the **Data Protection
   Act 2019**? Given the limited data described in section 3, must the operator
   register with the **Office of the Data Protection Commissioner** as a data
   controller or processor?

5. **Liability.** What is the operator's exposure if a user loses money after
   arriving through the site? Are the limitations in our Terms enforceable
   here, and what would strengthen them?

6. **Cross-border.** The site is reachable worldwide. Should we restrict access
   from jurisdictions where this would be unlawful, or is a disclaimer that
   Deriv's products are unavailable in some jurisdictions sufficient?

7. **Handing it to a client.** The site is being handed to a client who will
   run it under his own Deriv affiliate account. Does responsibility for the
   above transfer with it, and what should the agreement between us say?

---

## 6. What we will change based on the answers

Any of the following is straightforward to implement:

- Rewording or repositioning the risk warning, including making it blocking or
  requiring acknowledgement
- Adding an age or jurisdiction gate before login
- Geo-blocking specific countries
- Rewriting either legal page
- Removing the ability to place trades, leaving referral only
- Adding a data protection contact and rights-request route

The constraint worth knowing: **the trading functionality is the product**.
If it must be removed, the client should hear that before launch, not after.
