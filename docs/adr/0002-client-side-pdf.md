# ADR 0002: Generate PDFs in the browser

## Status

Accepted

## Decision

Generate the shopping list and recipe PDF with jsPDF in the browser.

## Consequences

Planning data never needs to leave the browser for PDF generation. PDF layout
quality depends on browser capabilities and the loaded PDF library.
