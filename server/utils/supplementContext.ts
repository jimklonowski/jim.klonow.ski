// The vitamin/supplement/skin stack as AI-prompt context: the standing items of category
// supplement/skin in the protocol tables (edited on /journal/protocol), mapped back to the row
// shape the prose reads by shared/utils/protocolStore.ts and rendered per request, so an edit
// reaches the prompts without a deploy. The wording is shared/utils/supplementProse.ts.
import type { LoadedProtocol } from '#shared/utils/protocolStore'
import { renderSupplementContext } from '#shared/utils/supplementProse'
import { loadProtocol } from './protocolLoader'

// '' when there is nothing to say. `protocol` saves the read when the caller already holds it.
export async function supplementContext(db: D1Database, asOf: string, protocol?: LoadedProtocol): Promise<string> {
  const loaded = protocol ?? await loadProtocol(db)
  return renderSupplementContext(loaded.supplements, asOf)
}
