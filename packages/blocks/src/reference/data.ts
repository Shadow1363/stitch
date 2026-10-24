import type { DocSection } from '../registry';

export const data: DocSection = {
  id: 'data',
  title: 'Data',
  entries: [
    {
      id: 'http_get',
      doc: 'Fetches `url` and reports the response body as text. The script waits until the reply arrives; other scripts keep running.',
      example: `local page = http_get("https://example.com/data.json")`,
      alt: 'local page = HTTP GET https://example.com/data.json',
    },
    {
      id: 'http_post',
      doc: 'Sends `body` to `url` and reports the response body. A body that is valid JSON goes out as `application/json`, anything else as plain text.',
      example: `local r = http_post("https://example.com/api", "{\\"score\\": 10}")`,
      alt: 'local r = HTTP POST {"score": 10} to https://example.com/api',
    },
    {
      id: 'http_status',
      doc: "The HTTP status of this sprite's last finished request: `200`, `404` and so on, or `0` when there was no answer (not allowed, offline, blocked by CORS, timed out, or a reply over 1 MB).",
      example: `if http_status() == 200 then
  say("ok")
end`,
      alt: 'if HTTP status = 200 then say ok',
      scope: 'clone',
    },
    {
      id: 'json_get',
      doc: 'Follows a dotted `path` into JSON text, a list or a dictionary. Numeric steps index arrays from 1. Arrays come back as lists, objects as dictionaries, and a missing step gives `""`. An empty path reads the whole value.',
      example: `say(json_get(page, "items.1.name"))`,
      alt: 'say item items.1.name of JSON page',
    },
    {
      id: 'json_parse',
      doc: 'Reads JSON text: an array becomes a list, an object a [dictionary](#grids-and-dictionaries), a number, string or boolean that value, and invalid JSON gives `""`.',
      example: `local scores = json_parse("[3, 1, 2]")`,
      alt: 'local scores = list from JSON [3, 1, 2]',
    },
  ],
};
