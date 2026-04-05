import {
  render,
  resolve,
  parseVariableSpec,
  renderTemplate,
  interpolateFilename,
  listVariables,
} from '../../src/template/engine.js';

describe('resolve', () => {
  test('resolves simple key', () => {
    expect(resolve('name', { name: 'Alice' })).toBe('Alice');
  });

  test('returns null for missing key', () => {
    expect(resolve('missing', {})).toBeNull();
  });

  test('resolves dot-notation', () => {
    expect(resolve('project.title', { project: { title: 'Test' } })).toBe('Test');
  });

  test('returns null for partial dot path', () => {
    expect(resolve('project.missing', { project: {} })).toBeNull();
  });

  test('resolves ENV. prefix from process.env', () => {
    process.env.TEST_CC_VAR = 'hello';
    expect(resolve('ENV.TEST_CC_VAR', {})).toBe('hello');
    delete process.env.TEST_CC_VAR;
  });
});

describe('parseVariableSpec', () => {
  test('returns name with no filters', () => {
    expect(parseVariableSpec('name')).toEqual({ name: 'name', filters: [] });
  });

  test('returns name and filters', () => {
    const result = parseVariableSpec('name|uppercase|trim');
    expect(result.name).toBe('name');
    expect(result.filters).toEqual(['uppercase', 'trim']);
  });
});

describe('render', () => {
  test('substitutes simple variable', () => {
    const { result, replaced } = render('Hello {{name}}!', { name: 'World' });
    expect(result).toBe('Hello World!');
    expect(replaced).toBe(1);
  });

  test('tracks missing variables', () => {
    const { missing } = render('Hello {{name}}!', {});
    expect(missing).toContain('name');
  });

  test('applies uppercase filter', () => {
    const { result } = render('{{name|uppercase}}', { name: 'hello' });
    expect(result).toBe('HELLO');
  });

  test('applies lowercase filter', () => {
    const { result } = render('{{name|lowercase}}', { name: 'WORLD' });
    expect(result).toBe('world');
  });

  test('applies capitalize filter', () => {
    const { result } = render('{{name|capitalize}}', { name: 'hello world' });
    expect(result).toBe('Hello world');
  });

  test('applies trim filter', () => {
    const { result } = render('{{name|trim}}', { name: '  spaces  ' });
    expect(result).toBe('spaces');
  });

  test('applies slug filter', () => {
    const { result } = render('{{title|slug}}', { title: 'Hello World Test' });
    expect(result).toBe('hello-world-test');
  });

  test('applies round filter', () => {
    const { result } = render('{{val|round}}', { val: '3.7' });
    expect(result).toBe('4');
  });

  test('renders conditional block when truthy', () => {
    const { result } = render('{{#if show}}yes{{/if}}', { show: true });
    expect(result).toBe('yes');
  });

  test('hides conditional block when falsy', () => {
    const { result } = render('{{#if show}}yes{{/if}}', { show: false });
    expect(result).toBe('');
  });

  test('renders each loop', () => {
    const { result } = render('{{#each items}}{{this}},{{/each}}', { items: ['a', 'b', 'c'] });
    expect(result).toBe('a,b,c,');
  });

  test('returns empty for each with empty array', () => {
    const { result } = render('{{#each items}}{{this}}{{/each}}', { items: [] });
    expect(result).toBe('');
  });

  test('multiple substitutions in one template', () => {
    const { result, replaced } = render('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 });
    expect(result).toBe('1 + 2 = 3');
    expect(replaced).toBe(3);
  });
});

describe('renderTemplate', () => {
  test('merges project meta under project.*', () => {
    const { result } = renderTemplate('{{project.title}}', {}, { title: 'My Video' });
    expect(result).toBe('My Video');
  });

  test('extra context overrides project meta', () => {
    const { result } = renderTemplate('{{title}}', { title: 'Override' }, { title: 'Original' });
    expect(result).toBe('Override');
  });
});

describe('interpolateFilename', () => {
  test('substitutes variables in filename pattern', () => {
    const result = interpolateFilename('{{name}}_output', { name: 'test' });
    expect(result).toBe('test_output');
  });

  test('sanitizes unsafe characters', () => {
    const result = interpolateFilename('{{name}}', { name: 'file<>name' });
    expect(result).not.toMatch(/[<>]/);
  });
});

describe('listVariables', () => {
  test('lists all variables in a template', () => {
    const vars = listVariables('{{name}} and {{title}} and {{name}}');
    expect(vars).toContain('name');
    expect(vars).toContain('title');
    // Should deduplicate
    expect(vars.filter((v) => v === 'name')).toHaveLength(1);
  });

  test('returns empty for template with no variables', () => {
    expect(listVariables('no variables here')).toHaveLength(0);
  });
});
