<template>
  <UContainer class="max-w-3xl py-16">
    <h1 class="text-3xl font-semibold tracking-tight">
      Privacy Policy
    </h1>
    <p class="mt-2 text-sm text-muted">
      Effective date: July 13, 2026
    </p>

    <div class="mt-10 space-y-10 text-sm leading-relaxed">
      <section>
        <p>
          jim.klonow.ski ("this site", "the app") is a personal health-tracking dashboard built and operated
          by Jim Klonowski. It is not a commercial product, and it is not open to public sign-up. This policy
          explains what data the site collects, how it's used, and how it's protected — including data
          accessed through connected third-party services such as Apple Health and WHOOP.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          What data is collected
        </h2>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>
            <strong class="text-default">Lab results and body composition</strong> — bloodwork and DEXA scan
            data uploaded manually by the site owner.
          </li>
          <li>
            <strong class="text-default">Journal entries</strong> — daily vitals, peptide protocols, food,
            workouts, and notes entered directly into the app.
          </li>
          <li>
            <strong class="text-default">Apple Health data</strong> — vitals, sleep, and workout data pushed
            from the Health Auto Export app via a private, authenticated webhook.
          </li>
          <li>
            <strong class="text-default">WHOOP data</strong> — recovery, sleep, cycle/strain, workout,
            body measurement, and profile data, retrieved via the WHOOP API after the site owner explicitly
            connects their WHOOP account through OAuth.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          How data is used
        </h2>
        <p class="mt-3 text-muted">
          All data collected is used exclusively to display the site owner's own health and fitness metrics
          back to them within this app — for example, correlating recovery and sleep trends against training
          load, lab markers, or peptide protocols. Data is never used for advertising, analytics profiling,
          or any purpose unrelated to the personal dashboard functionality of this site.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          WHOOP data specifically
        </h2>
        <p class="mt-3 text-muted">
          When the WHOOP integration is connected, this app requests read-only access to recovery, cycle,
          sleep, workout, profile, and body measurement data via WHOOP's OAuth API. This data is:
        </p>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-muted">
          <li>Stored only in this app's private database, used solely to render it back to the site owner.</li>
          <li>Never sold, rented, or shared with any third party or advertiser.</li>
          <li>Never used to train machine learning models or for any purpose outside this dashboard.</li>
          <li>
            Retained only for as long as the WHOOP account remains connected. Disconnecting the integration
            revokes the stored access and refresh tokens and stops any further syncing.
          </li>
        </ul>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          Data storage and security
        </h2>
        <p class="mt-3 text-muted">
          Data is stored in a Cloudflare D1 database backing this site, hosted on Cloudflare Workers. Access
          to the app's private sections requires a password or authenticated session, and all traffic is
          served over HTTPS. API keys, OAuth client secrets, and access tokens are kept as encrypted
          environment secrets and are never exposed to the browser or committed to source control.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          Data deletion
        </h2>
        <p class="mt-3 text-muted">
          The site owner can disconnect the WHOOP integration or delete any stored health data at any time.
          To request deletion of data associated with a connected account, contact
          <a href="mailto:security@jim.klonow.ski" class="text-primary">security@jim.klonow.ski</a>.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          Children's privacy
        </h2>
        <p class="mt-3 text-muted">
          This site is not directed at children and is not intended for use by anyone under 18.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          Changes to this policy
        </h2>
        <p class="mt-3 text-muted">
          This policy may be updated occasionally to reflect changes to the app's data practices. The
          effective date above reflects the most recent revision.
        </p>
      </section>

      <section>
        <h2 class="text-lg font-medium">
          Contact
        </h2>
        <p class="mt-3 text-muted">
          Questions about this policy or how data is handled can be sent to
          <a href="mailto:security@jim.klonow.ski" class="text-primary">security@jim.klonow.ski</a>.
        </p>
      </section>
    </div>
  </UContainer>
</template>
