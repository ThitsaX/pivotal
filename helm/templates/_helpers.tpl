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
{{- with .Values.global.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "pivotal-stack.selectorLabels" -}}
app.kubernetes.io/name: {{ include "pivotal-stack.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "pivotal-stack.envVars" -}}
{{- range $key, $value := . }}
- name: {{ $key }}
  {{- if kindIs "map" $value }}
  {{- if hasKey $value "valueFrom" }}
  valueFrom:
    {{- toYaml (get $value "valueFrom") | nindent 4 }}
  {{- else }}
  value: {{ (get $value "value") | quote }}
  {{- end }}
  {{- else }}
  value: {{ $value | quote }}
  {{- end }}
{{- end }}
{{- end -}}

{{- define "pivotal-stack.image" -}}
{{- $registry := trimSuffix "/" (default "" .global.imageRegistry) -}}
{{- $repository := required (printf "%s image.repository is required" .component) .image.repository -}}
{{- $tag := required (printf "%s image.tag is required" .component) .image.tag -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repository $tag -}}
{{- else -}}
{{- printf "%s:%s" $repository $tag -}}
{{- end -}}
{{- end -}}

{{- define "pivotal-stack.secretName" -}}
{{- default (printf "%s-secrets" (include "pivotal-stack.fullname" .)) .Values.global.secrets.existingSecret -}}
{{- end -}}

{{- define "pivotal-stack.imagePullSecretName" -}}
{{- default "ghcr-pull-secret" .Values.global.imageCredentials.secretName -}}
{{- end -}}

{{- define "pivotal-stack.imagePullSecrets" -}}
{{- $explicit := .Values.global.imagePullSecrets | default list -}}
{{- $create := .Values.global.imageCredentials.createSecret | default false -}}
{{- if or $explicit $create }}
imagePullSecrets:
  {{- range $item := $explicit }}
  {{- if kindIs "string" $item }}
  - name: {{ $item }}
  {{- else }}
  - name: {{ get $item "name" }}
  {{- end }}
  {{- end }}
  {{- if $create }}
  - name: {{ include "pivotal-stack.imagePullSecretName" . }}
  {{- end }}
{{- end }}
{{- end -}}

{{- define "pivotal-stack.databaseEnv" -}}
- name: DB_WRITE_HOST
  value: {{ coalesce .Values.global.database.writeHost .Values.global.database.writehost .Values.global.database.host | quote }}
- name: DB_WRITE_PORT
  value: {{ .Values.global.database.port | quote }}
- name: DB_WRITE_USERNAME
  value: {{ .Values.global.database.username | quote }}
- name: DB_WRITE_NAME
  value: {{ .Values.global.database.name | quote }}
- name: DB_READ_HOST
  value: {{ coalesce .Values.global.database.readHost .Values.global.database.readhost .Values.global.database.host | quote }}
- name: DB_READ_PORT
  value: {{ .Values.global.database.port | quote }}
- name: DB_READ_USERNAME
  value: {{ .Values.global.database.username | quote }}
- name: DB_READ_NAME
  value: {{ .Values.global.database.name | quote }}
{{- end -}}

{{- define "pivotal-stack.databaseSecretEnv" -}}
- name: DB_WRITE_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "pivotal-stack.secretName" . }}
      key: {{ .Values.global.secrets.dbWritePasswordKey }}
- name: DB_READ_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "pivotal-stack.secretName" . }}
      key: {{ .Values.global.secrets.dbReadPasswordKey }}
{{- end -}}

{{- define "pivotal-stack.mysqlSecretEnv" -}}
- name: MYSQL_ROOT_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "pivotal-stack.secretName" . }}
      key: {{ .Values.global.secrets.mysqlRootPasswordKey }}
{{- end -}}
