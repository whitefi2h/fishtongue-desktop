# FishTongue bundled engine notices

FishTongue bundles a FishTongue-specific desktop API around Lexurgy.

- Lexurgy is copyright its original contributors and distributed under
  GPL-3.0. Source: <https://github.com/def-gthill/lexurgy>
- The FishTongue engine baseline is upstream commit
  `fa5027711cba3cd6a3f4b6defd0d38181fa98cd4`.
- Lexurgy uses Kotlin, Ktor, ANTLR and their transitive dependencies. Their
  license metadata is included in the engine JAR and SBOM.
- The bundled Java runtime is built from Eclipse Temurin 21 LTS. Its complete
  `legal/` directory is retained in the packaged runtime.

The definitive version and checksum record is `engine-lock.json`. Generated
preview results are not persisted as project data.

Phase 3 also includes a clean-room deterministic word-generation module.
PolyGlot (<https://github.com/DraqueT/PolyGlot>, MIT) was reviewed for product
and algorithm ideas, but no PolyGlot source, Swing UI, XML storage, or binary
is included. Built-in Swadesh concept labels were normalized and cross-checked
against Concepticon 3.4.0; their precise provenance and resource hash are
recorded in `docs/phase-3/source-and-license-audit.md`.
