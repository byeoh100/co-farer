# Integration request shapes

Raw output of `npx deepspace integrations info <name>` (deepspace 0.44.2), captured 2026-11-21 during Phase 1 setup. Used by Module 3 (Housing), and later Activities and Food. Re-run the commands if the SDK version changes.

Notes:
- `anthropic/chat-completion` printed no output schema. Check the SDK types (or log one real response) before writing the zod parser in Module 3.
- Both are metered per call. The per-trip cap (`PLAN.md` §6) counts research calls.

```text
=== exa/search
exa/search
  Search the web with Exa neural search, with optional content extraction and filters.
  billing: metered at the provider's actual cost plus platform markup

Input schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "query": {
      "type": "string"
    },
    "q": {
      "type": "string"
    },
    "numResults": {
      "default": 10,
      "type": "number",
      "minimum": 1,
      "maximum": 100
    },
    "type": {
      "default": "auto",
      "type": "string"
    },
    "category": {
      "type": "string"
    },
    "userLocation": {
      "type": "string"
    },
    "includeDomains": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "excludeDomains": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "startPublishedDate": {
      "type": "string"
    },
    "endPublishedDate": {
      "type": "string"
    },
    "includeText": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "excludeText": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "context": {},
    "moderation": {
      "type": "boolean"
    },
    "contents": {
      "type": "object",
      "properties": {
        "text": {
          "anyOf": [
            {
              "type": "boolean"
            },
            {
              "type": "object",
              "properties": {
                "maxCharacters": {
                  "type": "number"
                },
                "includeHtmlTags": {
                  "type": "boolean"
                }
              }
            }
          ]
        },
        "highlights": {
          "type": "object",
          "properties": {
            "maxCharacters": {
              "type": "number",
              "minimum": 1
            },
            "query": {
              "type": "string"
            },
            "numSentences": {
              "type": "number",
              "minimum": 1
            },
            "highlightsPerUrl": {
              "type": "number",
              "minimum": 1
            }
          }
        },
        "summary": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string"
            }
          }
        },
        "extras": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        }
      }
    }
  }
}

Example body:
{
  "numResults": 10,
  "type": "auto"
}

Output schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": {
            "type": "string"
          },
          "url": {
            "type": "string"
          },
          "publishedDate": {
            "type": [
              "string",
              "null"
            ]
          },
          "author": {
            "type": [
              "string",
              "null"
            ]
          },
          "id": {
            "type": "string"
          },
          "image": {},
          "favicon": {},
          "text": {},
          "highlights": {},
          "summary": {},
          "extras": {
            "type": "object",
            "properties": {
              "links": {},
              "imageLinks": {}
            },
            "additionalProperties": false
          }
        },
        "required": [
          "title",
          "url",
          "publishedDate",
          "author",
          "id"
        ],
        "additionalProperties": false
      }
    },
    "context": {},
    "searchType": {},
    "costDollars": {
      "type": "object",
      "properties": {
        "total": {
          "type": "number"
        }
      },
      "additionalProperties": {}
    },
    "costUsd": {
      "type": "number"
    }
  },
  "required": [
    "results"
  ],
  "additionalProperties": false
}
=== anthropic/chat-completion
anthropic/chat-completion
  Generate text with a Claude model via the Anthropic Messages API. Free-tier pricing differs from paid-tier pricing. Standard pricing applies to: claude-haiku-5-5, claude-haiku-4-5.
  billing: metered at the provider's actual cost plus platform markup; free-tier pricing differs

Input schema:
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "model": {
      "default": "claude-opus-5-5",
      "type": "string"
    },
    "max_tokens": {
      "default": 4096,
      "type": "number",
      "minimum": 1
    },
    "messages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": {
            "type": "string",
            "enum": [
              "user",
              "assistant"
            ]
          },
          "content": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "type": "array",
                "items": {
                  "type": "object",
                  "propertyNames": {
                    "type": "string"
                  },
                  "additionalProperties": {}
                }
              }
            ]
          }
        },
        "required": [
          "role",
          "content"
        ]
      }
    },
    "system": {
      "type": "string"
    },
    "temperature": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    }
  },
  "required": [
    "messages"
  ]
}

Example body:
{
  "model": "claude-opus-5-5",
  "max_tokens": 4096
}
```
