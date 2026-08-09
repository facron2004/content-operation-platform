import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../../../stores/auth';
import { requestBrowserLogin } from '../../../stores/auth-requests';
import { extractErrorMessage } from '../../../services/http-client';
import { resolveLoginRedirect } from '../utils/login-redirect';

export { resolveLoginRedirect } from '../utils/login-redirect';

type AuthStoreLike = { setAuth: (username: string) => void };

export async function performLogin(args: {
  username: string;
  password: string;
  authStore: AuthStoreLike;
  redirect: string;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
  navigate: (path: string) => void;
}): Promise<void> {
  if (!args.username.trim() || !args.password.trim()) {
    args.setError('请输入用户名和密码');
    return;
  }
  args.setLoading(true);
  args.setError(null);
  try {
    const result = await requestBrowserLogin(args.username.trim(), args.password.trim());
    if (!result.username) throw new Error('登录响应无效');
    args.authStore.setAuth(result.username);
    ElMessage.success('登录成功');
    args.navigate(args.redirect);
  } catch (e: unknown) {
    args.setError(extractErrorMessage(e, '登录失败，请检查网络连接'));
  } finally {
    args.setLoading(false);
  }
}

export function useLoginPage() {
  const authStore = useAuthStore(),
    router = useRouter(),
    route = useRoute(),
    loading = ref(false),
    error = ref<string | null>(null),
    form = reactive({ username: '', password: '' });
  async function handleLogin() {
    await performLogin({
      username: form.username,
      password: form.password,
      authStore,
      redirect: resolveLoginRedirect(route.query.redirect),
      setError: (msg) => {
        error.value = msg;
      },
      setLoading: (v) => {
        loading.value = v;
      },
      navigate: (path) => {
        router.push(path);
      }
    });
  }
  return { form, loading, error, handleLogin };
}
