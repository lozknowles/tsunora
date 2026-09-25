"""Deterministic restricted-function validator, executed inside a networkless sandbox."""
import ast,json,sys

def validate(payload):
    source=payload['source'].strip()
    if source.startswith('```'):
        lines=source.splitlines()
        if lines[-1].strip()=='```': source='\n'.join(lines[1:-1])
    tree=ast.parse(source)
    if len(tree.body)!=1 or not isinstance(tree.body[0],ast.FunctionDef) or tree.body[0].name!='solve':
        raise ValueError('one_solve_function_required')
    allowed=(ast.Module,ast.FunctionDef,ast.arguments,ast.arg,ast.Return,ast.If,ast.IfExp,ast.For,ast.While,ast.Break,ast.Continue,ast.Assign,ast.AugAssign,ast.Expr,ast.Name,ast.Load,ast.Store,ast.Constant,ast.List,ast.Tuple,ast.Dict,ast.Set,ast.BinOp,ast.UnaryOp,ast.BoolOp,ast.Compare,ast.Call,ast.Attribute,ast.Subscript,ast.Slice,ast.ListComp,ast.SetComp,ast.DictComp,ast.GeneratorExp,ast.comprehension,ast.Add,ast.Sub,ast.Mult,ast.Div,ast.FloorDiv,ast.Mod,ast.Pow,ast.USub,ast.UAdd,ast.And,ast.Or,ast.Not,ast.Eq,ast.NotEq,ast.Lt,ast.LtE,ast.Gt,ast.GtE,ast.In,ast.NotIn,ast.Is,ast.IsNot,ast.keyword)
    builtins={'sum':sum,'len':len,'range':range,'min':min,'max':max,'abs':abs,'sorted':sorted,'set':set,'list':list,'dict':dict,'enumerate':enumerate,'zip':zip,'int':int,'float':float,'bool':bool,'round':round}
    for node in ast.walk(tree):
        if not isinstance(node,allowed):raise ValueError('syntax_outside_declared_workload')
        if isinstance(node,ast.Name) and node.id.startswith('_'):raise ValueError('private_name_forbidden')
        if isinstance(node,ast.Attribute) and node.attr not in ('append','extend','count','index','get','keys','values','items','fromkeys'):raise ValueError('attribute_forbidden')
        if isinstance(node,ast.FunctionDef) and (node.decorator_list or node.returns):raise ValueError('decorators_and_annotations_forbidden')
    env={'__builtins__':builtins}
    exec(compile(tree,'candidate.py','exec'),env)
    results=[]
    for value,expected in zip(payload['inputs'],payload['expected']):
        actual=env['solve'](value)
        results.append({'passed':type(actual) is type(expected) and actual==expected or isinstance(actual,(int,float)) and isinstance(expected,(int,float)) and abs(actual-expected)<1e-9,'actual':actual,'expected':expected})
    return {'validator':'restricted-python-functions/v1','passed':len(results)==len(payload['expected']) and all(r['passed'] for r in results),'checks':results}

try:
    print(json.dumps(validate(json.load(sys.stdin)),allow_nan=False))
except Exception as error:
    print(json.dumps({'validator':'restricted-python-functions/v1','passed':False,'reason':type(error).__name__+': '+str(error)[:300]}))
