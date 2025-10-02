#!/home/punk/.venv/bin/python
"""
Lark-based parser and interpreter for the .pf language
"""

from lark import Lark, Transformer, v_args
import sys
import os
import shutil
import shlex

# Ensure local imports work even when invoked via a symlink or from another directory
_REAL_SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
if _REAL_SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _REAL_SCRIPT_DIR)

# Try to prefer the generated standalone parser when available
try:
    from pf_grammar import Lark_StandAlone as StandaloneParser  # type: ignore
except Exception:
    StandaloneParser = None  # type: ignore

class PfInterpreter(Transformer):
    """
    Transform the parsed tree into executable actions
    """
    
    def __init__(self):
        self.env_vars = {}
        self.tasks = {}
        self.current_env = {}  # For variable substitution
    
    @v_args(inline=True)
    def env_var(self, name, value):
        # Store environment variable (strip quotes from value)
        clean_value = value[1:-1]  # Remove surrounding quotes
        self.env_vars[name] = clean_value
        self.current_env[name] = clean_value
        print(f"Set env: {name} = {clean_value}")
        return ("env", name, clean_value)
    
    @v_args(inline=True)
    def comment(self, text):
        # Just ignore comments
        return ("comment", text)
    
    @v_args(inline=True)
    def task(self, name, *args):
        # Separate params from task body
        params = []
        body = []
        
        for arg in args:
            if isinstance(arg, tuple) and arg[0] == "param":
                params.append(arg)
            else:
                body.append(arg)
        
        task_def = {
            "name": name,
            "params": params,
            "body": body
        }
        
        self.tasks[name] = task_def
        print(f"Defined task: {name}")
        return ("task", name, task_def)
    
    @v_args(inline=True)
    def param(self, name, value):
        return ("param", name, value[1:-1])  # Strip quotes
    
    @v_args(inline=True)
    def describe(self, text):
        return ("describe", text.strip())
    
    @v_args(inline=True)
    def shell(self, command):
        return ("shell", command.strip())
    
    @v_args(inline=True)
    def for_loop(self, var_name, iterable, *body):
        return ("for", var_name, iterable, list(body))
    
    @v_args(inline=True)
    def if_stmt(self, condition, *rest):
        """Transform if/else bodies into simple lists of task_body items.
        Children arrive as: condition, NEWLINE token, Tree('if_body', ...), optional Tree('else_body', ...)
        """
        if_body = []
        else_body = []
        for node in rest:
            if hasattr(node, 'data'):
                if node.data == 'if_body':
                    if_body = list(node.children)
                elif node.data == 'else_body':
                    else_body = list(node.children)
            # Ignore NEWLINE tokens and anything else
        return ("if", condition, if_body, else_body)
    
    @v_args(inline=True)
    def var_equals(self, variable, operator, value):
        return ("var_equals", variable, operator, value[1:-1])  # Strip quotes
    
    @v_args(inline=True)
    def var_exists(self, variable):
        return ("var_exists", variable)
    
    @v_args(inline=True)
    def command_succeeds(self, *parts):
        """Handle `command` conditions. Parts may include BACKQUOTE tokens and COMMAND_TEXT.
        Extract the COMMAND_TEXT content regardless of tokenization.
        """
        text = None
        for p in parts:
            # Prefer explicit COMMAND_TEXT tokens
            if getattr(p, 'type', None) == 'COMMAND_TEXT':
                text = str(p)
                break
        if text is None and parts:
            # Fallback: choose the first non-backquote-looking piece
            for p in parts:
                s = str(p)
                if s.strip('`').strip():
                    text = s
                    break
        if text is None:
            text = ""
        return ("command_succeeds", text.strip())
    
    @v_args(inline=True)
    def array(self, *items):
        # Strip quotes from string items
        return [item[1:-1] for item in items]
    
    @v_args(inline=True)
    def variable(self, name):
        return ("var", name)

    # --- sync support ---
    @v_args(inline=True)
    def sync_kv(self, key, value=None):
        """Handle a single key/value or flag inside a sync statement.
        Returns (key, value) where value can be str (without quotes), list[str], or True for flags.
        """
        k = str(key)
        if value is None:
            return (k, True)
        # Arrays already come as python lists (from array()), strings are quoted tokens
        if isinstance(value, list):
            return (k, value)
        # token STRING e.g. "text"
        v = value[1:-1]
        return (k, v)

    @v_args(inline=True)
    def sync_stmt(self, *pairs):
        """Collect sync key/values into a dict and emit a normalized tuple for execution."""
        opts = {}
        # pairs may already be expanded due to inline=True
        for p in pairs:
            if isinstance(p, tuple) and len(p) == 2:
                k, v = p
                opts[k] = v
        # Normalize booleans for known flags
        for flag in ("dry", "delete", "verbose"):
            if flag in opts and opts[flag] is True:
                continue
        return ("sync", opts)
    
    def execute_task(self, task_name, **kwargs):
        """Execute a specific task"""
        if task_name not in self.tasks:
            print(f"Task '{task_name}' not found!")
            return
        
        task = self.tasks[task_name]
        
        # Set up environment with task parameters
        env = self.current_env.copy()
        env.update(kwargs)
        
        # Set default parameter values
        for param_type, param_name, param_value in task["params"]:
            if param_name not in env:
                env[param_name] = param_value
        
        print(f"\n=== Executing task: {task_name} ===")
        self._execute_body(task["body"], env)
    
    def _execute_body(self, body, env):
        """Execute a list of task body items"""
        print(f"DEBUG: Executing body with {len(body)} items")
        for i, item in enumerate(body):
            print(f"DEBUG: Processing item {i}: {type(item)} - {item}")
            
            # Handle both tuples (transformed) and Tree objects (raw)
            if isinstance(item, tuple):
                cmd_type = item[0]
                print(f"DEBUG: Command type: {cmd_type}")
                
                if cmd_type == "describe":
                    print(f"Description: {item[1]}")
                
                elif cmd_type == "shell":
                    command = self._substitute_vars(item[1], env)
                    print(f"Shell: {command}")
                    
                    # Actually execute the command!
                    try:
                        result = os.system(command)
                        if result != 0:
                            print(f"  [WARN] Command failed with exit code {result}")
                        else:
                            print(f"  [OK] Command succeeded")
                    except Exception as e:
                        print(f"  [ERROR] Error executing command: {e}")
                
                elif cmd_type == "sync":
                    try:
                        self._execute_sync(item[1], env)
                    except Exception as e:
                        print(f"  [ERROR] Sync failed: {e}")
            
            elif hasattr(item, 'data') and hasattr(item, 'children'):
                # It's a Tree object, extract the data
                if len(item.children) > 0 and isinstance(item.children[0], tuple):
                    cmd_tuple = item.children[0]
                    cmd_type = cmd_tuple[0]
                    
                    if cmd_type == "describe":
                        print(f"Description: {cmd_tuple[1]}")
                    
                    elif cmd_type == "shell":
                        command = self._substitute_vars(cmd_tuple[1], env)
                        print(f"Shell: {command}")
                        
                        # Actually execute the command!
                        try:
                            result = os.system(command)
                            if result != 0:
                                print(f"  [WARN] Command failed with exit code {result}")
                            else:
                                print(f"  [OK] Command succeeded")
                        except Exception as e:
                            print(f"  [ERROR] Error executing command: {e}")
                    
                    elif cmd_type == "if":
                        condition, if_body, else_body = cmd_tuple[1], cmd_tuple[2], cmd_tuple[3]
                        if self._evaluate_condition(condition, env):
                            print("  [IF: condition is TRUE]")
                            self._execute_body(if_body, env)
                        elif else_body:
                            print("  [IF: condition is FALSE, executing ELSE]")
                            self._execute_body(else_body, env)
                        else:
                            print("  [IF: condition is FALSE, skipping]")
                    
                    elif cmd_type == "sync":
                        try:
                            self._execute_sync(cmd_tuple[1], env)
                        except Exception as e:
                            print(f"  [ERROR] Sync failed: {e}")
                
                else:
                    print(f"DEBUG: Skipping Tree item with no valid children: {item}")
            else:
                print(f"DEBUG: Skipping item: {item}")
    
    def _evaluate_condition(self, condition, env):
        """Evaluate an if condition"""
        if not isinstance(condition, tuple):
            return False
        
        cond_type = condition[0]
        
        if cond_type == "var_equals":
            var_tuple, operator, expected = condition[1], condition[2], condition[3]
            if isinstance(var_tuple, tuple) and var_tuple[0] == "var":
                var_name = var_tuple[1]
                actual = env.get(var_name, "")
                
                if operator == "==":
                    result = actual == expected
                elif operator == "!=":
                    result = actual != expected
                else:
                    result = False
                
                print(f"    Condition: ${var_name} ({actual}) {operator} {expected} = {result}")
                return result
        
        elif cond_type == "var_exists":
            var_tuple = condition[1]
            if isinstance(var_tuple, tuple) and var_tuple[0] == "var":
                var_name = var_tuple[1]
                value = env.get(var_name, "")
                result = bool(value)
                print(f"    Condition: ${var_name} exists = {result} (value: '{value}')")
                return result
        
        elif cond_type == "command_succeeds":
            command = self._substitute_vars(condition[1], env)
            print(f"    Condition: `{command}` succeeds...")
            try:
                result = os.system(command) == 0
                print(f"    Command result: {result}")
                return result
            except Exception as e:
                print(f"    Command failed: {e}")
                return False
        
        return False
    
    def _substitute_vars(self, text, env):
        """Simple variable substitution: ${var} -> value"""
        result = text
        for var_name, var_value in env.items():
            result = result.replace(f"${{{var_name}}}", str(var_value))
            result = result.replace(f"${var_name}", str(var_value))
        return result

    def _execute_sync(self, opts, env):
        """Build and execute an rsync command from sync options.
        Supported keys: src (required), dest (required), host, user, port, excludes (list), exclude_file, delete, dry, verbose
        """
        if shutil.which("rsync") is None:
            print("  [ERROR] rsync not found on PATH")
            return

        # Required
        src = opts.get("src")
        dest = opts.get("dest")
        if not src or not dest:
            raise ValueError("sync requires src and dest")

        # Substitute variables in strings and arrays
        def sub(v):
            return self._substitute_vars(v, env)

        src = sub(src)
        dest_path = sub(dest)

        user = opts.get("user")
        host = opts.get("host")
        port = opts.get("port")
        if isinstance(port, str) and port.isdigit():
            port = int(port)

        excludes = opts.get("excludes") or []
        if isinstance(excludes, list):
            excludes = [sub(x) for x in excludes]
        exclude_file = opts.get("exclude_file")
        if isinstance(exclude_file, str):
            exclude_file = sub(exclude_file)

        delete = bool(opts.get("delete", False))
        dry = bool(opts.get("dry", False))
        verbose = bool(opts.get("verbose", True))  # default true per docs

        # Build rsync command
        cmd = ["rsync", "-a"]  # archive mode preserves attrs
        if verbose:
            cmd.append("-v")
        if dry:
            cmd.append("-n")
        if delete:
            cmd.append("--delete")
        for pat in excludes:
            cmd.extend(["--exclude", pat])
        if exclude_file:
            cmd.extend(["--exclude-from", exclude_file])

        ssh_cmd = None
        if host:
            # ssh transport
            if port:
                ssh_cmd = f"ssh -p {int(port)}"
            else:
                ssh_cmd = "ssh"
            cmd.extend(["-e", ssh_cmd])
            # remote dest spec user@host:path
            prefix = f"{user}@{host}" if user else str(host)
            dest_spec = f"{prefix}:{dest_path}"
        else:
            dest_spec = dest_path

        # Quote paths safely
        cmd.append(shlex.quote(src))
        cmd.append(shlex.quote(dest_spec))

        printable = " ".join(cmd)
        print(f"Sync: {printable}")
        try:
            result = os.system(printable)
            if result != 0:
                print(f"  [WARN] rsync exit code {result}")
            else:
                print("  [OK] rsync completed")
        except Exception as e:
            print(f"  [ERROR] Error running rsync: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python pf_parser.py <file.pf> [task_name] [param=value ...]")
        print("       python pf_parser.py <file.pf> --list")
        sys.exit(1)
    
    pf_file = sys.argv[1]
    
    # Instantiate interpreter first (so we can attach it to standalone parser)
    interpreter = PfInterpreter()

    # Prefer standalone parser if available, else load grammar file
    if StandaloneParser is not None:
        parser = StandaloneParser(transformer=interpreter)
        use_transform = False
    else:
        with open("pf.lark", "r") as f:
            grammar = f.read()
        parser = Lark(grammar, parser='lalr')
        use_transform = True
    
    # Parse the file
    with open(pf_file, "r") as f:
        source = f.read()
    
    try:
        tree = parser.parse(source)
        
        # Transform and interpret
        if use_transform:
            interpreter.transform(tree)
        
        # Handle command line arguments
        if len(sys.argv) == 2:
            # Just show parse tree and tasks
            print("=== Parse Tree ===")
            print(tree.pretty())
            print("\n=== Available Tasks ===")
            for task_name in interpreter.tasks:
                print(f"  - {task_name}")
            
        elif sys.argv[2] == "--list":
            # List tasks only
            print("Available tasks:")
            for task_name, task in interpreter.tasks.items():
                desc = ""
                for item in task["body"]:
                    if isinstance(item, tuple) and item[0] == "describe":
                        desc = item[1]
                        break
                print(f"  {task_name:15} - {desc}")
                
        else:
            # Execute specific task
            task_name = sys.argv[2]
            
            # Parse task parameters from command line
            task_params = {}
            for arg in sys.argv[3:]:
                if "=" in arg:
                    key, value = arg.split("=", 1)
                    task_params[key] = value
            
            if task_name in interpreter.tasks:
                interpreter.execute_task(task_name, **task_params)
            else:
                print(f"Task '{task_name}' not found!")
                print("Available tasks:")
                for name in interpreter.tasks:
                    print(f"  - {name}")
                sys.exit(1)
        
    except Exception as e:
        print(f"Parse error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
