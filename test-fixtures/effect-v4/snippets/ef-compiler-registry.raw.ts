) => CompiledDecoder[K] | undefined

/** @internal */
export type CompileSource = (ast: SchemaAST.AST, resolve: Resolve) => DecoderSource | undefined

/** @internal */
export type Compiled = DecoderSource | Compile

const cache = new WeakMap<SchemaAST.AST, Entry>()
let compiler: CompileSource | undefined

/** @internal */
export let compilerAdaptersEnabled = false

function activateCompilerAdapters(): void {
  compilerAdaptersEnabled = true

): Parser {
  const entry = resolve(ast)
  if (entry.compiled === undefined || Object.hasOwn(entry, operation)) {
    return entry[operation]
  }
  let parser: Parser | undefined
  return (input, options) => (parser ??= entry[operation])(input, options)
}

/** @internal */
export function resolve(ast: SchemaAST.AST): Entry {
  const cached = cache.get(ast)
  if (cached !== undefined) return cached
  const entry = compiler === undefined
    ? new InterpretedEntry(ast)
    : new CompilerEntry(ast, compiler(ast, resolve), resolve)
  cache.set(ast, entry)
  return entry
}

/** @internal */
export function set(ast: SchemaAST.AST, decoder: DecoderSource | undefined, resolveChild: Resolve = resolve): Entry {
  if (decoder !== undefined) activateCompilerAdapters()
