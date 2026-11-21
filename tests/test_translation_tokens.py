import ast
import unittest
from pathlib import Path

TREE = ast.parse(Path('server.py').read_text(encoding='utf-8'))
NODES = [n for n in TREE.body if (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'TOKEN_PATTERN' for t in n.targets)) or (isinstance(n, ast.FunctionDef) and n.name in {'_tokens', '_safe_translation'})]
NS = {}
exec(compile(ast.Module(body=NODES, type_ignores=[]), 'server.py', 'exec'), NS)

class TokenTests(unittest.TestCase):
    def test_placeholders_markup_preserved(self):
        src = '<b>Hi</b> {0} %s [NAME] §'
        dst = '<b>Привет</b> {0} %s [NAME] §'
        self.assertEqual(NS['_safe_translation'](src, dst), dst)
    def test_missing_placeholder_falls_back(self):
        self.assertEqual(NS['_safe_translation']('Hi {0}', 'Привет'), 'Hi {0}')
    def test_extra_placeholder_falls_back(self):
        self.assertEqual(NS['_safe_translation']('Hi', 'Привет {0}'), 'Hi')
    def test_markup_change_falls_back(self):
        self.assertEqual(NS['_safe_translation']('<b>Hi</b>', 'Привет'), '<b>Hi</b>')
    def test_placeholder_order_is_checked(self):
        self.assertEqual(NS['_safe_translation']('{0} %s', '%s {0}'), '%s {0}')

if __name__ == '__main__':
    unittest.main()
