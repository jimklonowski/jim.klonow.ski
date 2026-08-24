<template>
  <div>
    <!-- Title row -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3.5 border-b border-line">
      <h1 class="num-display text-hi text-[24px] leading-none">
        PRIVACY POLICY
      </h1>
      <p class="text-[11px] text-muted tracking-[0.06em] uppercase">
        effective july 13, 2026
      </p>
      <span class="ml-auto text-[11px] text-muted hidden sm:inline">personal dashboard · not open to public sign-up</span>
    </div>

    <!-- Prose is the one place a comfortable line-height is correct -->
    <div class="px-4 sm:px-6 py-4 max-w-3xl">
      <p class="text-[12.5px] leading-[1.7] text-dim">
        jim.klonow.ski ("this site", "the app") is a personal health-tracking dashboard built and operated
        by Jim Klonowski. It is not a commercial product, and it is not open to public sign-up. This policy
        explains what data the site collects, how it's used, and how it's protected — including data
        accessed through connected third-party services such as Apple Health and WHOOP.
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
              <strong class="text-hi font-medium">Lab results and body composition</strong> — bloodwork and
              DEXA scan data uploaded manually by the site owner.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Journal entries</strong> — daily vitals, peptide protocols,
              food, workouts, and notes entered directly into the app.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">Apple Health data</strong> — vitals, sleep, and workout data
              pushed from the Health Auto Export app via a private, authenticated webhook.
            </span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              <strong class="text-hi font-medium">WHOOP data</strong> — recovery, sleep, cycle/strain, workout,
              body measurement, and profile data, retrieved via the WHOOP API after the site owner explicitly
              connects their WHOOP account through OAuth.
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
          All data collected is used exclusively to display the site owner's own health and fitness metrics
          back to them within this app — for example, correlating recovery and sleep trends against training
          load, lab markers, or peptide protocols. Data is never used for advertising, analytics profiling,
          or any purpose unrelated to the personal dashboard functionality of this site.
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
            <span>Stored only in this app's private database, used solely to render it back to the site owner.</span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>Never sold, rented, or shared with any third party or advertiser.</span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>Never used to train machine learning models or for any purpose outside this dashboard.</span>
          </li>
          <li class="flex gap-2">
            <span class="text-faint shrink-0">·</span>
            <span>
              Retained only for as long as the WHOOP account remains connected. Disconnecting the integration
              revokes the stored access and refresh tokens and stops any further syncing.
            </span>
          </li>
        </ul>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="DATA STORAGE AND SECURITY"
          :dashes="9"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          Data is stored in a Cloudflare D1 database backing this site, hosted on Cloudflare Workers. Access
          to the app's private sections requires a password or authenticated session, and all traffic is
          served over HTTPS. API keys, OAuth client secrets, and access tokens are kept as encrypted
          environment secrets and are never exposed to the browser or committed to source control.
        </p>
      </section>

      <section class="mt-5">
        <TuiHeader
          label="DATA DELETION"
          :dashes="21"
        />
        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          The site owner can disconnect the WHOOP integration or delete any stored health data at any time.
          To request deletion of data associated with a connected account, contact
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
          This policy may be updated occasionally to reflect changes to the app's data practices. The
          effective date above reflects the most recent revision.
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
