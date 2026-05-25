# Load Balancing Demo — VoltGuard

## Architecture

```
Apache Bench → Kong Service → 2-5 Kong pods  (HPA: 75% CPU target)
                                    ↓
               Frontend Service → 2-5 Frontend pods  (HPA: 50% CPU target)
```

All pods run on **different physical nodes** — real distributed infrastructure.  
Both layers auto-scale under load and self-heal when pods are lost.

---

## Step 0 — Clean state (run before EVERY demo)

```bash
# Restart pods so logs start from zero
kubectl rollout restart deployment/grupo4-kong -n tenant-grupo4-egs-deti-ua-pt
kubectl rollout restart deployment/grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt

# Wait for rollout to finish
kubectl rollout status deployment/grupo4-kong -n tenant-grupo4-egs-deti-ua-pt
kubectl rollout status deployment/grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt
```

Then confirm exactly 2 pods per service and HPA at 2 replicas:
```bash
kubectl get pods -n tenant-grupo4-egs-deti-ua-pt -o wide
kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt
```

Expected — **only proceed when you see this:**
```
NAME                      TARGETS       MINPODS   MAXPODS   REPLICAS
compositor-frontend-hpa   cpu: 2%/50%   2         5         2
kong-hpa                  cpu: ~48%/75% 2         5         2
```

> If REPLICAS shows more than 2, the HPA hasn't scaled down yet from a previous test. Wait ~60 seconds and recheck.

---

## Step 1 — Show the architecture

Run in any terminal:
```bash
kubectl get pods -n tenant-grupo4-egs-deti-ua-pt -o wide
```

Point out: 2 Kong pods + 2 Frontend pods, each on a **different physical node**.

---

## Step 2 — Open monitoring terminals (keep ALL open)

Open 4 terminals and paste one command in each. Leave them all running.

**Terminal 1 — Frontend log stream:**
```bash
kubectl logs -f -l app=grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt --max-log-requests=10
```
> Shows which pod handles each request. During the test you will see two source IPs alternating — proof of load distribution.

**Terminal 2 — HPA live watch:**
```bash
watch -n 2 kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt
```
> Shows `TARGETS` climbing and `REPLICAS` jumping as HPA fires. Refreshes every 2 seconds.

**Terminal 3 — Frontend pod live watch:**
```bash
watch -n 2 kubectl get pods -n tenant-grupo4-egs-deti-ua-pt -l app=grupo4-compositor-frontend
```
> Shows frontend pods appearing/disappearing in real time as HPA scales or a pod is deleted.

**Terminal 4 — Kong pod live watch:**
```bash
watch -n 2 kubectl get pods -n tenant-grupo4-egs-deti-ua-pt -l app=grupo4-kong
```
> Shows Kong pods scaling under load. During the resilience demo, Kong staying healthy while a frontend pod dies proves the gateway layer is independent.

**Terminal 5 — HPA event log:**
```bash
kubectl get events -n tenant-grupo4-egs-deti-ua-pt --field-selector involvedObject.kind=HorizontalPodAutoscaler --watch
```
> Streams the exact moment and reason the HPA decides to scale.

---

## Step 3 — Run the stress test (Terminal 6)

One test that shows **load balancing + auto-scaling simultaneously**:

```bash
kubectl run ab-test --image=httpd:alpine --rm -it --restart=Never -n tenant-grupo4-egs-deti-ua-pt -- ab -n 100000 -c 200 -H "Host: grupo4-egs-deti.ua.pt" http://kong:8000/
```

### Command breakdown

**`kubectl run ab-test`** — creates a temporary pod inside the cluster.  
Why inside the cluster? Traffic hits the **Kong Service directly** via kube-proxy, which properly distributes across both Kong pods. Running `ab` from outside (port-forward) tunnels through only one pod.

| Flag | Meaning |
|------|---------|
| `--image=httpd:alpine` | Apache HTTP server image — includes `ab` built in |
| `--rm` | Deletes the pod automatically when the command finishes |
| `--restart=Never` | Runs as a one-shot job, not a long-lived deployment |
| `-it` | Streams `ab` output to your terminal in real time |
| `-n tenant-grupo4-egs-deti-ua-pt` | Inside the namespace — can reach internal services |

| ab Flag | Meaning |
|---------|---------|
| `-n 100000` | 100k requests — run lasts 60+ seconds, giving HPA time to observe and react |
| `-c 200` | 200 concurrent connections — pushes CPU past the HPA threshold |
| `-H "Host: ..."` | Tells Kong which route to match |
| `http://kong:8000/` | Internal Kong Service DNS — only reachable from inside the cluster |

### What to narrate while ab is running

1. **Point at Terminal 1** — *"Watch the two source IPs alternating — both Kong pods are actively forwarding requests"*
2. **Point at Terminal 2** — *"TARGETS is climbing… it just passed the 50% threshold"*
3. **Point at Terminal 3** — *"Frontend pods scaling up automatically"*
4. **Point at Terminal 4** — *"Kong pods scaling up too — both layers growing under load"*
5. **Point at Terminal 5** — when this appears:
   ```
   SuccessfulRescale  New size: 4; reason: cpu resource utilization above target
   ```
   Say: *"That's the system explaining its own decision — no human intervention"*

### Key numbers to highlight from ab output

| Metric | What it proves |
|--------|---------------|
| `Requests per second` | Throughput under load |
| `Failed requests: 0` | Zero errors despite auto-scaling mid-test |
| `50% served within Xms` | Median latency |
| `99% served within Xms` | Tail latency |

---

## Step 4 — Count requests per pod (Terminal 6, after ab finishes)

```bash
for pod in $(kubectl get pods -l app=grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt -o name); do
  echo -n "$pod: "
  kubectl logs $pod -n tenant-grupo4-egs-deti-ua-pt | grep -c "GET /"
done
```

> Counts how many requests each pod served. Original pods will show large numbers; pods spawned by HPA mid-test will show fewer (they arrived late) or zero. All of this is expected.

Example output:
```
pod/grupo4-compositor-frontend-...-aaa: 6563   ← original pod
pod/grupo4-compositor-frontend-...-bbb: 3536   ← original pod
pod/grupo4-compositor-frontend-...-ccc: 0      ← HPA pod, arrived late
pod/grupo4-compositor-frontend-...-ddd: 0      ← HPA pod, arrived late
```

Say: *"The 2 original pods split the load between them. The new pods arrived mid-test — they are ready for the next wave of traffic."*

---

## Step 5 — Resilience Demo (Terminal 6)

Say: *"What happens when a pod crashes mid-traffic?"*

First, get the name of one frontend pod to delete:
```bash
kubectl get pods -l app=grupo4-compositor-frontend -n tenant-grupo4-egs-deti-ua-pt
```

Copy one pod name, then delete it — this simulates a real crash:
```bash
kubectl delete pod <pod-name> -n tenant-grupo4-egs-deti-ua-pt
```

> Why delete instead of scale? HPA has `minReplicas: 2` — scaling to 1 would be immediately reversed. Deleting a pod simulates an actual crash: the pod is gone instantly, and the Deployment controller races to recreate it.

Point at Terminal 3 — the pod disappears. Then immediately run traffic:

```bash
kubectl run ab-test --image=httpd:alpine --rm -it --restart=Never -n tenant-grupo4-egs-deti-ua-pt -- ab -n 5000 -c 50 -H "Host: grupo4-egs-deti.ua.pt" http://kong:8000/
```

Say: *"One pod gone — zero failed requests. Kong rerouted everything to the surviving pod instantly."*

Point at Terminal 3 again — the Deployment controller recreates the deleted pod automatically.

Say: *"And there it is — the system healed itself. No human action, no downtime."*

### The bigger picture

| Basic deployment | This system |
|-----------------|-------------|
| 1 pod → 1 failure = downtime | 2+ pods → 1 failure = zero downtime |
| Manual restart needed | HPA restores automatically |
| Traffic lost during crash | Kong reroutes instantly |
| Fixed capacity | Scales 2→5 pods under load, back to 2 when idle |

*"This is not just load balancing — it is a resilient, self-healing, auto-scaling system."*

---

## Cleanup — Run after every test

```bash
# Remove stuck ab-test pod (if a run was interrupted)
kubectl delete pod ab-test -n tenant-grupo4-egs-deti-ua-pt --ignore-not-found

# Restore frontend to 2 replicas if resilience demo left it at 1
kubectl scale deployment grupo4-compositor-frontend --replicas=2 -n tenant-grupo4-egs-deti-ua-pt

# Confirm HPA is back to 2 replicas (wait ~60s after load stops)
kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt
kubectl get pods -n tenant-grupo4-egs-deti-ua-pt
```

> After the load stops, HPA takes ~60 seconds to scale back down (configured `stabilizationWindowSeconds: 60`). If you need it faster, manually scale: `kubectl scale deployment grupo4-compositor-frontend --replicas=2 -n tenant-grupo4-egs-deti-ua-pt`

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `kubectl get pods -n tenant-grupo4-egs-deti-ua-pt -o wide` | Show all pods and their nodes |
| `kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt` | Show HPA targets and replica counts |
| `kubectl top pods -n tenant-grupo4-egs-deti-ua-pt` | Live CPU and memory per pod |
| `kubectl rollout restart deployment/<name> -n tenant-grupo4-egs-deti-ua-pt` | Clean pod logs before demo |
| `kubectl rollout status deployment/<name> -n tenant-grupo4-egs-deti-ua-pt` | Wait for rollout to finish |
| `kubectl scale deployment/<name> --replicas=N -n tenant-grupo4-egs-deti-ua-pt` | Manually scale up/down |
| `kubectl delete pod ab-test -n tenant-grupo4-egs-deti-ua-pt --ignore-not-found` | Remove stuck ab-test pod |
| `kubectl logs -f -l app=<label> -n tenant-grupo4-egs-deti-ua-pt --max-log-requests=10` | Stream logs from all pods with a label |
| `watch -n 2 kubectl get hpa -n tenant-grupo4-egs-deti-ua-pt` | Live HPA status every 2s |
| `kubectl get events -n tenant-grupo4-egs-deti-ua-pt --field-selector involvedObject.kind=HorizontalPodAutoscaler --watch` | Stream HPA scaling decisions |
