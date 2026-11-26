#!/bin/bash
cd /home/user/ideatoapps-free-claude-code/demo-kit/bench
for spec in "simple A 5" "simple C 5" "simple B 5" "bug A 3" "bug C 3" "bug B 3"; do set -- $spec
  for i in $(seq 1 $3); do ./run_one.sh $1 $2 $i; tail -1 results.jsonl; sleep 3; done; done
echo ALLDONE
