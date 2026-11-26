#!/bin/bash
cd /home/user/ideatoapps-free-claude-code/demo-kit/rec; mkdir -p cast
for s in scene1_direct scene2_router scene3_opencode; do
  rm -rf box${s: 5:1}; script -qfc "bash ./$s.sh" --timing=cast/$s.timing --log-out=cast/$s.log > /dev/null 2>&1 < /dev/null
  echo "$s done: $(wc -c < cast/$s.log) bytes"
done
