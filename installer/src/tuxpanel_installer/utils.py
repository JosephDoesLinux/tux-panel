import sys
import subprocess

def run_streaming(cmd: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    print(f"Running: {' '.join(cmd)}")
    sys.stdout.flush()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        **kwargs
    )
    
    out_lines = []
    if proc.stdout:
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            out_lines.append(line)
            
    proc.wait()
    output = "".join(out_lines)
    
    if proc.returncode != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd, output=output, stderr="")
        
    return subprocess.CompletedProcess(args=cmd, returncode=proc.returncode, stdout=output, stderr="")
