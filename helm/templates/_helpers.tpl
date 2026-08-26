{{- define "pivotal-stack.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "pivotal-stack.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "pivotal-stack.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "pivotal-stack.labels" -}}
helm.sh/chart: {{ include "pivotal-stack.chart" . }}
app.kubernetes.io/name: {{ include "pivotal-stack.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "pivotal-stack.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pivotal-stack.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "pivotal-stack.envVars" -}}
{{- range $key, $value := . }}
- name: {{ $key }}
  value: {{ $value | quote }}
{{- end }}
{{- end -}}

{{/*
ServiceAccount name for a component.

Takes a dict: "component" (the component's values block) and "default" (the name
used when the component declares none). Vault's Kubernetes auth binds a role to
specific ServiceAccount names, so this is what makes per-tenant key isolation
possible -- a pod running as "default" can authenticate as nothing.
*/}}
{{- define "pivotal-stack.serviceAccountName" -}}
{{- $component := .component | default dict -}}
{{- $serviceAccount := $component.serviceAccount | default dict -}}
{{- $serviceAccount.name | default .default -}}
{{- end -}}
