<template>
  <div>
    <!-- Title row -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3.5 border-b border-line">
      <h1 class="num-display text-hi text-[24px] leading-none">
        PRIVACY POLICY
      </h1>
      <p class="text-[11px] text-muted tracking-[0.06em] uppercase">
        effective september 23, 2026
      </p>
      <span class="ml-auto text-[11px] text-muted hidden sm:inline">personal dashboard · not open to public sign-up</span>
    </div>

    <!-- Prose is the one place a comfortable line-height is correct -->
    <div class="px-4 sm:px-6 py-4 max-w-3xl">
      <p class="text-[12.5px] leading-[1.7] text-dim">
        jim.klonow.ski ("this site", "the app") is a personal health-tracking dashboard built and operated
        by Jim Klonowski ("the site owner"). It is not a commercial product and it is not open to public
        sign-up: the only person whose health data it holds is the site owner. This policy explains what
        data the site collects, how it's used, who can see it, which service providers process it, and how
        it's protected, including data accessed through connected services such as Apple Health and WHOOP.
      </p>

      <section class="mt-5">
        <TuiHeader
          label="WHAT DATA IS COLLECTED"
          :dashes="12"
        />
        <ul class="mt-2.5 space-y-1.5 text-[12.5px] leading-[1.7] text-dim">
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Lab results and body composition</strong>: bloodwork, DEXA,
              and similar reports uploaded by the site owner, including the original PDF files.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Journal entries</strong>: daily vitals, medication and
              supplement protocols, food, workouts, vaccines, progress photos, and notes entered directly
              into the app.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Apple Health data</strong>: vitals, sleep, and workout data
              pushed from the Health Auto Export app via a private, authenticated webhook.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">WHOOP data</strong>: recovery, sleep, cycle/strain, workout,
              body measurement, and profile data, retrieved via the WHOOP API after the site owner explicitly
              connects their WHOOP account through OAuth.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Access data</strong>: a session cookie for signed-in
              visitors, records of the share links the site owner has issued, and visitor IP addresses, used
              briefly for rate limiting and request logs (see "Cookies and logs").
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="HOW DATA IS USED"
          :dashes="18"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          All data is used only to show the site owner's own health and fitness metrics back to them within
          this app. For example, the app correlates recovery and sleep trends with training load, lab markers,
          or medication protocols, and generates written summaries of those trends. Data is never sold, never
          used for advertising or analytics profiling, and never used for any purpose unrelated to this
          personal dashboard.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="WHO CAN SEE IT"
          :dashes="20"
        />
        <ul class="mt-2.5 space-y-1.5 text-[12.5px] leading-[1.7] text-dim">
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">The site owner</strong> can see and edit everything,
              including all data collected from WHOOP and Apple Health.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">People the site owner invites</strong>: the owner can choose
              to issue a private share link that gives a specific person read-only access, either to the whole
              dashboard or to a limited view for a clinician (lab results, body composition, and vitals and
              protocol trends). No one gets access unless the owner deliberately creates a link for them.
              Links can expire, and revoking a link immediately signs out everyone who used it.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Demo visitors</strong> see only an invented persona stored in
              a separate database. No real health data, including WHOOP data, is ever shown in the demo.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Everyone else</strong> can see only public pages such as this
              one. Health data is never publicly displayed.
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="AI PROCESSING"
          :dashes="21"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Some features send data to Anthropic's Claude API to generate a response:
        </p>
        <ul class="mt-2 space-y-1.5 text-[12.5px] leading-[1.7] text-dim">
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Daily and weekly digests</strong> and the
              <strong class="text-hi font-medium">Ask</strong> chat: summaries of journal entries, lab results,
              workouts, and WHOOP recovery, strain, and sleep metrics.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Lab report import</strong>: uploaded lab and body
              composition PDFs, which the model reads so their values can be saved.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Inventory import</strong>: freeform text the site owner
              pastes in to describe supplies.
            </span>
          </li>
        </ul>
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Only the site owner can start these requests. This data is sent only to get a response for the site
          owner. This site never uses any data, including WHOOP data, to create, train, fine-tune, test, or
          improve any AI or machine learning model. By default, Anthropic does not train its models on data
          sent through its API; see
          <a
            href="https://www.anthropic.com/legal/privacy"
            target="_blank"
            rel="noopener"
            class="text-accent hover:text-accent-hover"
          >Anthropic's privacy policy</a>
          for how it handles API data. AI-generated summaries are personal notes for the site owner. They are
          not medical advice.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="WHOOP DATA SPECIFICALLY"
          :dashes="11"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          When the WHOOP integration is connected, this app requests read-only access to recovery, cycle,
          sleep, workout, profile, and body measurement data via WHOOP's OAuth API. This data is:
        </p>
        <ul class="mt-2 space-y-1.5 text-[12.5px] leading-[1.7] text-dim">
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Stored in this app's private database and shown only to the site owner and to anyone the owner has
              explicitly invited, as described in "Who can see it".
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Sent to Anthropic only as described in "AI processing", to generate responses for the site owner.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Never sold, rented, licensed, or shared with advertisers or data brokers; never used in
              advertising; and never used to train or improve any AI or machine learning model.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Always identified as coming from WHOOP. It is never combined with other data in a way that hides
              where it came from.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Kept until the site owner deletes it. Access can be revoked at any time from the WHOOP app. The
              site then stops syncing, and data already synced stays until the owner deletes it. If this site
              stops using the WHOOP API, all synced WHOOP data will be deleted.
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="SERVICE PROVIDERS"
          :dashes="17"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          The site relies on a small number of providers, each used only to run this dashboard:
          <strong class="text-hi font-medium">Cloudflare</strong> (hosting, database, and file storage),
          <strong class="text-hi font-medium">Anthropic</strong> (the AI features described above),
          <strong class="text-hi font-medium">WHOOP</strong> and
          <strong class="text-hi font-medium">Health Auto Export</strong> (sources of the owner's own data).
          No data is disclosed to anyone else, except where required by law.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="COOKIES AND LOGS"
          :dashes="18"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          The site sets a single signed, HTTP-only session cookie when someone signs in, plus a short-lived
          cookie that authorizes lab uploads. There are no analytics, advertising, or third-party tracking
          cookies. To block abuse, visitor IP addresses are briefly counted on the sign-in, share-link, demo,
          and AI endpoints, and these counts expire automatically. Cloudflare also keeps short-lived request
          logs, which include IP addresses and requested URLs, so the site can be run and debugged.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="DATA STORAGE AND SECURITY"
          :dashes="9"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Data is stored in Cloudflare D1 databases and Cloudflare R2 file storage, which encrypt data at rest,
          and the site runs on Cloudflare Workers. All traffic is served over HTTPS. Private sections require a
          password or an authenticated session, and uploaded lab reports and photos can be opened only through
          authenticated requests. API keys and OAuth client secrets are kept as encrypted environment secrets
          and are never committed to source control. WHOOP access and refresh tokens are stored only on the
          server and are never sent to the browser.
        </p>
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          If a security incident exposes personal data, the site owner will notify anyone affected as the law
          requires. If WHOOP data is involved, the owner will notify WHOOP within 48 hours of discovering the
          incident.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="DATA RETENTION AND DELETION"
          :dashes="7"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Health data is kept until the site owner deletes it, and the owner can delete any stored data at any
          time. Access for invited people ends when their link expires or is revoked. To ask a question about
          data this site holds, or to request its deletion, contact
          <a
            href="mailto:security@jim.klonow.ski"
            class="text-accent hover:text-accent-hover"
          >security@jim.klonow.ski</a>.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="CHILDREN'S PRIVACY"
          :dashes="16"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          This site is not directed at children and is not intended for use by anyone under 18.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="CHANGES TO THIS POLICY"
          :dashes="12"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          This policy is updated whenever the app's data practices change. The effective date at the top of
          this page shows the most recent revision.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="CONTACT"
          :dashes="27"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Questions about this policy or how data is handled can be sent to
          <a
            href="mailto:security@jim.klonow.ski"
            class="text-accent hover:text-accent-hover"
          >security@jim.klonow.ski</a>.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
useSeoMeta({ title: 'Privacy Policy' })
</script>
