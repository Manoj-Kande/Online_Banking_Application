import React, { useCallback,useEffect,useState } from 'react'
import { Button } from './ui/button'
import { PlaidLinkOnSuccess, PlaidLinkOptions, usePlaidLink } from 'react-plaid-link';
import { useRouter } from 'next/navigation';
import { createLinkToken, exchangePublicToken } from '@/lib/actions/user.actions';
import { toast } from 'sonner';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

const PlaidLink = ({user,variant}:PlaidLinkProps) => {
  
    const [token, setToken] = useState('');
    // True while we're exchanging the public token / creating the funding
    // source after the user finishes the Plaid Link flow (i.e. after they hit
    // "Save"/"Continue" on the last Plaid step). Without this, the button just
    // looked clickable/dead for however long that network round trip took.
    const [isLinking, setIsLinking] = useState(false);
    const router=useRouter();
    useEffect(() => {
      const getLinkToken = async ()=>{
        try {
          const data= await createLinkToken(user);
          if(!data?.linkToken){
            toast.error("We couldn't set up bank linking right now. Please try again shortly.");
            return;
          }
          setToken(data.linkToken);
        } catch (error) {
          console.log(error);
          toast.error(
            error instanceof Error
              ? error.message
              : "We couldn't set up bank linking right now. Please try again shortly."
          );
        }
    }
      getLinkToken();
    }, [user]);
    
    const onSuccess =useCallback<PlaidLinkOnSuccess>(async (public_token:string)=>{
        setIsLinking(true);
        try {
          const result = await exchangePublicToken({
              publicToken:public_token,
              user,
          });
          if(!result){
            toast.error("We connected to your bank but couldn't finish linking the account. Please try again.");
            setIsLinking(false);
            return;
          }
          toast.success("Bank account linked successfully!");
          router.push('/');
          // Deliberately not resetting isLinking here: we're navigating away,
          // so keeping the button in its loading state avoids a flash back to
          // "Connect bank" during the redirect.
        } catch (error) {
          console.log(error);
          toast.error(
            error instanceof Error
              ? error.message
              : "Something went wrong while linking your bank account."
          );
          setIsLinking(false);
        }
    },[user, router]);

  const config:PlaidLinkOptions ={
    token,
    onSuccess
  }

  const {open,ready}=usePlaidLink(config);

  
    return (
    <>
        {variant === "primary" ? (
            <Button 
                onClick={()=>open()}
                disabled={!ready || isLinking}
                className='plaidlink-primary'
            >
                {isLinking ? (
                    <>
                        <Loader2 size={20} className="animate-spin" /> &nbsp;
                        Linking account...
                    </>
                ) : "Connect bank"}
            </Button>
        ):variant==='ghost'?(
            <Button
            onClick={()=>open()}
            variant="ghost"
            disabled={isLinking}
            className='plaidlink-ghost' 
            >
                {isLinking ? (
                    <>
                        <Loader2 size={20} className="animate-spin" />
                        <p className='hiddenl text-[16px] font-semibold text-black-2 xl:block'>
                            Linking account...
                        </p>
                    </>
                ) : (
                    <>
                        <Image
                        src="/icons/connect-bank.svg"
                        alt='connect bank'
                        width={24}
                        height={24}
                        />
                        <p
                        className=' hiddenl text-[16px] font-semibold
                        text-black-2 xl:block
                        '
                        >Connect bank</p>
                    </>
                )}
            </Button>
        ):(
            <Button 
            onClick={()=>open()}
            disabled={isLinking}
            className='plaidlink-default' >
                {isLinking ? (
                    <>
                        <Loader2 size={20} className="animate-spin" />
                        <p className='text-[16px] font-semibold text-black-2'>
                            Linking account...
                        </p>
                    </>
                ) : (
                    <>
                        <Image
                        src="/icons/connect-bank.svg"
                        alt='connect bank'
                        width={24}
                        height={24}
                        />
                        <p
                        className='text-[16px] font-semibold
                        text-black-2
                        '
                        >Connect bank</p>
                    </>
                )}
            </Button>
        )}
    </>
  )
}

export default PlaidLink