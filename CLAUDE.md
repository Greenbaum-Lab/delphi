# CLAUDE.md

Instructions for working on the Delphi genome browser. Read this file first,
every session.

---

## Repository structure

`ARCHITECTURE.md` in the repository root is the authoritative description of
the codebase and its data flow. Read it to understand how modules fit together
rather than inferring structure from filenames.

`/apc/` is a shared library and is off limits by long-standing project
convention. Do not modify anything in it.

`.intent/` is legacy planning material. Only `.intent/system` is current, and
its contents are reproduced below. The other files there describe hg38,
client-side Web Worker computation and `.janno` metadata; the real app uses
hg19, AWS Lambda and JSON. Do not trust them.

---

## Token economy

Work in as few tokens as the task allows.

- Read what the task needs, not the whole repository. Prefer targeted search
  over reading files end to end.
- Do not re-read a file already read in the session, and do not re-read a file
  just to confirm an edit landed.
- Answer concisely. No preamble, no summary of what you are about to do, no
  restating of work already reported.

---

## Factual basis and reliability

1. When uncertain, always ask the user for input. Never assume anything about
   code you have not seen.
2. The user will prompt you to confirm changes before coding. Do not write
   code without being asked to.
3. Do not make any changes to code that were not explicitly requested.
4. When writing code, write only what you were asked to. Do not add arguments
   or conditions without being asked to.
5. Code should be clear and professional and optimized as much as possible.
6. Think about all components when designing code, with the goal of making
   functions and scripts as general as possible, and not specific for every
   small purpose.
7. Code should be maintainable and modular.
8. Answer concisely and to the point, and work step by step.

---

## Stylistic code guidelines

1. **Indentation:** Use tabs for indentation in all code.
2. **Character set:** Never use non-ASCII characters anywhere in code,
   including comments and docstrings.
3. **Typing:** Do not use Python typing or type hints in function definitions.
4. **Quotations:** Use single quotation marks where possible, instead of
   double quotes.
5. **Comments:**
   - Do not add inline comments next to code.
   - Do not write section comments or blocks of comments that describe code
     sections.
   - Do not write comments that refer to changes, other messages, or the
     process. Avoid comments such as "changed from the previous version" or
     comments answering questions from our conversation.
6. **Variable names:** Use descriptive variable names that make code
   self-explanatory and reduce the need for comments. JavaScript variable
   names are underscore-delimited, with only JavaScript function names being
   camelCase. No abbreviations or cryptic shortened words for variable names.
   Those are hard to read and create inconsistencies in shortening styles
   across the code.
7. **Docstrings:** Write good docstrings for important functions when
   necessary, rather than comments.
8. **General:** Follow these stylistic rules in all future code writing.

---

## The gold standard

Write modular code where modules have a minimal, fixed interface between them.
An exception is helper modules, which will have an extensive interface with
other code.

Apply microservice architecture in separating modules. Each module exposes
only the necessary interface functions, and these are fixed, while internal
logic can be developed without affecting the interface.

- Modules are short, 100 to 200 lines maximum.
- Limit changes to modules with substantial use. If there is a need to change
  something, always prefer to change the high level code rather than basic
  modules.
- Use functional programming paradigm: least possible mutability, stateless,
  no classes.
- Functions are short, 10 to 20 lines maximum.
- Do not add blank lines in the middle of functions. These indicate that the
  function is too long or has too many disparate responsibilities.
- Functions do one thing, and do not have catchall arguments.
- No inline comments, docstrings only for crucial functions.
- Variable names are meaningful, readable and not shortened. Do not assign
  cryptic variable names and then explain them in inline comments. This is an
  anti-pattern.
- Do not use variations of a variable name in different parts of the code for
  the same data. Always use the exact same variable name for the same data.
- Do not try to catch all exceptions and then simply print errors and rethrow
  or create silent errors. This is an anti-pattern. Only catch exceptions in
  very specific cases where the code needs to continue running, for instance
  if we run sandboxed code and want to test if it works.
- Do not rush to reimplement something that might already be implemented. Do
  not rush to create new basic module functions. Code writing should be very
  careful for any low-level functionality.
