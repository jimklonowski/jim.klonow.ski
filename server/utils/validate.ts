import type { H3Event } from 'h3'
import type { z } from 'zod'

// h3 glue for the request schemas in shared/utils/schemas.ts. A failed parse becomes a 400 that
// names the offending field, instead of the TypeError-turned-500 an unchecked `readBody` cast
// produced (`body.map is not a function`, or a D1 "wrong type" deep inside a bind).
//
// Nitro's default production error handler passes a createError `message` through and swallows
// everything else, so these messages are the only field-level feedback a client gets.

/** "peptides.0.dose: expected a number, received string; date: expected a YYYY-MM-DD date" */
function explain(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    .join('; ')
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw createError({ statusCode: 400, message: explain(result.error) })
  }
  return result.data
}

/**
 * Reads the JSON body and validates it. Also converts the "body isn't an object at all" case
 * (a cross-site form post, a truncated upload) into a 400 rather than a destructuring TypeError.
 */
export async function readValidatedJson<S extends z.ZodType>(event: H3Event, schema: S): Promise<z.output<S>> {
  let body: unknown
  try {
    body = await readBody(event)
  }
  catch {
    throw createError({ statusCode: 400, message: 'Expected a JSON body' })
  }
  return parseOrThrow(schema, body ?? {})
}

/** Validates the query string. Use z.coerce.* for numeric params — query values are strings. */
export function validatedQuery<S extends z.ZodType>(event: H3Event, schema: S): z.output<S> {
  return parseOrThrow(schema, getQuery(event))
}
