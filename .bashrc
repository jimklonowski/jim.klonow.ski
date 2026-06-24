# Start ssh-agent if not already running
if [ -z "$SSH_AGENT_PID" ]; then
  eval $(ssh-agent -s)
fi

# Add your SSH private key
ssh-add "C:\Users\JCK\.ssh\id_rsa"

# source "C:\repo-jck\jim-klonow-ski\.bashrc"
# source .bashrc

# Make nvm-windows available in Git Bash
export NVM_HOME="/c/Users/JCK/AppData/Roaming/nvm"
export NVM_SYMLINK="/c/Program Files/nodejs"
export PATH="$NVM_HOME:$NVM_SYMLINK:$PATH"
alias nvm="nvm.exe"
