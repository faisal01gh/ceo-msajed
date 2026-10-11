"""TEST ONLY SQL lexical-framing checks, NOT a PostgreSQL grammar/compiler.

No SQL is executed. Detect unclosed comments/quotes/dollar bodies, unbalanced
parentheses, unterminated top-level statements and outer transaction nesting.
PL/pgSQL name binding, catalog validity, grammar and runtime remain unverified.
"""
import argparse
import json
import pathlib
import re

DOLLAR = re.compile(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$')
WORD = re.compile(r'[A-Za-z_][A-Za-z_0-9$]*')


def scan(text, *, split_statements=False):
    i = 0
    depth = 0
    statements = []
    words = []
    dollar_bodies = 0
    while i < len(text):
        if text[i].isspace():
            i += 1
            continue
        if text.startswith('--', i):
            end = text.find('\n', i + 2)
            i = len(text) if end < 0 else end + 1
            continue
        if text.startswith('/*', i):
            nesting = 1
            i += 2
            while nesting and i < len(text):
                if text.startswith('/*', i):
                    nesting += 1
                    i += 2
                elif text.startswith('*/', i):
                    nesting -= 1
                    i += 2
                else:
                    i += 1
            if nesting:
                raise ValueError('unclosed SQL block comment')
            continue
        if text[i] in "'\"":
            quote = text[i]
            escaped = quote == "'" and i > 0 and text[i - 1] in 'eE' and (i < 2 or not text[i - 2].isalnum())
            i += 1
            closed = False
            while i < len(text):
                if escaped and text[i] == '\\':
                    i += 2
                elif text[i] == quote:
                    if i + 1 < len(text) and text[i + 1] == quote:
                        i += 2
                    else:
                        i += 1
                        closed = True
                        break
                else:
                    i += 1
            if not closed:
                raise ValueError('unclosed SQL string/identifier')
            continue
        tag = DOLLAR.match(text, i)
        if tag:
            end = text.find(tag[0], tag.end())
            if end < 0:
                raise ValueError('unclosed SQL dollar body: ' + tag[0])
            body = text[tag.end():end]
            nested = scan(body)
            dollar_bodies += 1 + nested['dollar_bodies']
            i = end + len(tag[0])
            continue
        if text[i] == '(':
            depth += 1
        elif text[i] == ')':
            depth -= 1
            if depth < 0:
                raise ValueError('unmatched closing SQL parenthesis')
        elif text[i] == ';' and split_statements and depth == 0:
            if not words:
                raise ValueError('empty top-level SQL statement')
            statements.append(words)
            words = []
        else:
            word = WORD.match(text, i)
            if word:
                words.append(word[0])
                i = word.end()
                continue
        i += 1
    if depth:
        raise ValueError('unclosed SQL parenthesis')
    if split_statements and words:
        raise ValueError('unterminated top-level SQL statement')
    return {'statements': statements, 'dollar_bodies': dollar_bodies}


def inspect_sql(raw):
    result = scan(raw.decode('utf-8'), split_statements=True)
    commands = [statement[0].upper() for statement in result['statements']]
    transactions = [command for command in commands if command in ('BEGIN', 'COMMIT', 'ROLLBACK', 'START')]
    if transactions != ['BEGIN', 'COMMIT'] or commands[0] != 'BEGIN' or commands[-1] != 'COMMIT':
        raise ValueError('expected one atomic outer BEGIN/COMMIT and no nested transaction commands')
    return {'evidence_class': 'offline_lexical_framing_only',
            'statement_count': len(commands), 'transaction_commands': transactions,
            'dollar_bodies': result['dollar_bodies'], 'sql_executed': False,
            'postgresql_grammar_verified': False, 'plpgsql_compiled': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sql', type=pathlib.Path)
    args = parser.parse_args(argv)
    print(json.dumps(inspect_sql(args.sql.read_bytes()), sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
